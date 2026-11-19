from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any
import httpx
from core.config import settings
from core.db_sqlite import get_cursor, upsert_cursor, upsert_document
from core.models import Comment, Document
from ingest.identity import hash_email, resolve_canonical_person

logger = logging.getLogger(__name__)

BOT_SUBSTRINGS = ["[bot]", "dependabot", "github-actions", "pre-commit-ci", "codecov"]


def is_bot_account(author_handle: str | None) -> bool:
    if not author_handle:
        return True
    handle_lower = author_handle.lower()
    return any(b in handle_lower for b in BOT_SUBSTRINGS)


def get_raw_cache_path(url: str, raw_dir: Path | None = None) -> Path:
    base_dir = (raw_dir or settings.RAW_DATA_DIR) / "github"
    base_dir.mkdir(parents=True, exist_ok=True)
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return base_dir / f"{url_hash}.json"


def get_cached_response(url: str, raw_dir: Path | None = None) -> Any | None:
    cache_path = get_raw_cache_path(url, raw_dir)
    if cache_path.exists():
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def set_cached_response(url: str, data: Any, raw_dir: Path | None = None) -> None:
    cache_path = get_raw_cache_path(url, raw_dir)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def make_github_request(
    url: str,
    token: str | None = None,
    client: httpx.Client | None = None,
    raw_dir: Path | None = None,
) -> Any:
    cached = get_cached_response(url, raw_dir)
    if cached is not None:
        return cached

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "DecisionTrail/1.0 (Data Ingest)",
    }
    auth_token = token or settings.GITHUB_TOKEN
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    def do_fetch(c: httpx.Client) -> Any:
        resp = c.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        set_cached_response(url, data, raw_dir)
        return data

    if client:
        return do_fetch(client)
    with httpx.Client(timeout=30.0) as c:
        return do_fetch(c)


def ingest_github_repo(
    repo: str,
    limit: int = 300,
    since: str | None = None,
    token: str | None = None,
    client: httpx.Client | None = None,
    db_path: Path | str | None = None,
    raw_dir: Path | None = None,
) -> list[Document]:
    if not since:
        since = get_cursor("github", repo, db_path=db_path)

    base_url = f"https://api.github.com/repos/{repo}/issues?state=closed&direction=desc&sort=updated&per_page=100"
    if since:
        base_url += f"&since={since}"

    documents: list[Document] = []
    page = 1
    total_fetched = 0
    max_updated_at: str | None = None

    while total_fetched < limit:
        paged_url = f"{base_url}&page={page}"
        try:
            issues = make_github_request(paged_url, token=token, client=client, raw_dir=raw_dir)
        except Exception as e:
            logger.error(f"Failed to fetch GitHub issues from {paged_url}: {e}")
            break

        if not issues:
            break

        for item in issues:
            total_fetched += 1
            if total_fetched > limit:
                break

            number = item["number"]
            is_pr = "pull_request" in item
            platform = "github_pr" if is_pr else "github_issue"
            thread_id = f"github_{repo}_{number}"
            title = item.get("title", "")
            created_at = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
            updated_at_str = item.get("updated_at", item["created_at"])
            if not max_updated_at or updated_at_str > max_updated_at:
                max_updated_at = updated_at_str

            comments: list[Comment] = []

            # 1. Thread body as the first comment
            body = item.get("body") or ""
            author = item.get("user", {}).get("login", "unknown")
            if not is_bot_account(author) and body.strip():
                resolve_canonical_person(platform, author, db_path=db_path)
                comments.append(
                    Comment(
                        comment_id=f"{thread_id}_body",
                        author_handle=author,
                        author_email=None,
                        posted_at=created_at,
                        body=body,
                        url=item["html_url"],
                    )
                )

            # 2. Fetch issue comments
            comments_url = item.get("comments_url")
            if comments_url:
                try:
                    c_list = make_github_request(
                        comments_url, token=token, client=client, raw_dir=raw_dir
                    )
                    for c_item in c_list:
                        c_author = c_item.get("user", {}).get("login", "unknown")
                        c_body = c_item.get("body") or ""
                        if is_bot_account(c_author) or not c_body.strip():
                            continue
                        resolve_canonical_person(platform, c_author, db_path=db_path)
                        comments.append(
                            Comment(
                                comment_id=f"gh_c_{c_item['id']}",
                                author_handle=c_author,
                                author_email=None,
                                posted_at=datetime.fromisoformat(
                                    c_item["created_at"].replace("Z", "+00:00")
                                ),
                                body=c_body,
                                url=c_item.get("html_url", item["html_url"]),
                            )
                        )
                except Exception as e:
                    logger.warning(f"Error fetching comments for issue #{number}: {e}")

            # 3. For PRs, fetch review comments and changed files
            files_metadata: list[dict[str, Any]] = []
            if is_pr:
                pr_url = item["pull_request"]["url"]
                review_comments_url = f"{pr_url}/comments"
                files_url = f"{pr_url}/files"

                try:
                    r_comments = make_github_request(
                        review_comments_url, token=token, client=client, raw_dir=raw_dir
                    )
                    for r_item in r_comments:
                        r_author = r_item.get("user", {}).get("login", "unknown")
                        r_body = r_item.get("body") or ""
                        if is_bot_account(r_author) or not r_body.strip():
                            continue
                        resolve_canonical_person(
                            "github_review", r_author, db_path=db_path
                        )
                        comments.append(
                            Comment(
                                comment_id=f"gh_rc_{r_item['id']}",
                                author_handle=r_author,
                                author_email=None,
                                posted_at=datetime.fromisoformat(
                                    r_item["created_at"].replace("Z", "+00:00")
                                ),
                                body=r_body,
                                url=r_item.get("html_url", item["html_url"]),
                            )
                        )
                except Exception as e:
                    logger.warning(f"Error fetching review comments for PR #{number}: {e}")

                try:
                    files_data = make_github_request(
                        files_url, token=token, client=client, raw_dir=raw_dir
                    )
                    for f in files_data:
                        files_metadata.append(
                            {
                                "filename": f.get("filename"),
                                "previous_filename": f.get("previous_filename"),
                                "status": f.get("status"),
                            }
                        )
                except Exception as e:
                    logger.warning(f"Error fetching files for PR #{number}: {e}")

            doc = Document(
                thread_id=thread_id,
                platform=platform,
                url=item["html_url"],
                title=title,
                created_at=created_at,
                comments=comments,
            )
            upsert_document(doc, db_path=db_path)
            documents.append(doc)

        if len(issues) < 100:
            break
        page += 1

    if max_updated_at:
        upsert_cursor("github", repo, max_updated_at, db_path=db_path)

    return documents

