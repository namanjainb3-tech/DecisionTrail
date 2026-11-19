from __future__ import annotations

import hashlib
import html
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any
import httpx
from core.config import settings
from core.db_sqlite import get_cursor, upsert_cursor, upsert_document
from core.models import Comment, Document
from ingest.identity import resolve_canonical_person

logger = logging.getLogger(__name__)


def clean_html_to_text(html_content: str) -> str:
    """Converts HTML markup from Discourse cooked posts to clean plain text."""
    if not html_content:
        return ""

    text = html_content
    # Remove script and style elements
    text = re.sub(r"<(script|style).*?>.*?</\1>", "", text, flags=re.DOTALL)
    # Replace blockquotes with quote indicator
    text = re.sub(r"<aside class=\"quote.*?>([\s\S]*?)</aside>", r"\n> \1\n", text)
    # Convert <p>, <br>, <div> to newlines
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</p>", "\n\n", text)
    text = re.sub(r"</div>", "\n", text)
    text = re.sub(r"</li>", "\n", text)
    # Remove remaining HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Unescape HTML entities (&amp;, &gt;, &lt;, etc.)
    text = html.unescape(text)
    # Normalize excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_topic_id(url_or_id: str) -> str:
    cleaned = url_or_id.strip().rstrip("/")
    # Handle pure numeric ID
    if cleaned.isdigit():
        return cleaned
    # Regex match /t/(slug/)?(\d+)
    match = re.search(r"/t/(?:[^/]+/)?(\d+)", cleaned)
    if match:
        return match.group(1)
    # Fallback to last numeric sequence
    match = re.search(r"(\d+)(?:\.json)?$", cleaned)
    if match:
        return match.group(1)
    raise ValueError(f"Cannot extract numeric Discourse topic ID from {url_or_id}")


def get_raw_discourse_cache_path(url: str, raw_dir: Path | None = None) -> Path:
    base_dir = (raw_dir or settings.RAW_DATA_DIR) / "discourse"
    base_dir.mkdir(parents=True, exist_ok=True)
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return base_dir / f"{url_hash}.json"


def get_cached_discourse_response(url: str, raw_dir: Path | None = None) -> Any | None:
    cache_path = get_raw_discourse_cache_path(url, raw_dir)
    if cache_path.exists():
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def set_cached_discourse_response(url: str, data: Any, raw_dir: Path | None = None) -> None:
    cache_path = get_raw_discourse_cache_path(url, raw_dir)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def make_discourse_request(
    url: str,
    client: httpx.Client | None = None,
    raw_dir: Path | None = None,
    sleep_sec: float = 1.0,
) -> Any:
    cached = get_cached_discourse_response(url, raw_dir)
    if cached is not None:
        return cached

    headers = {
        "Accept": "application/json",
        "User-Agent": "DecisionTrail/1.0 (Discourse Ingest; educational)",
    }

    def do_fetch(c: httpx.Client) -> Any:
        resp = c.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        set_cached_discourse_response(url, data, raw_dir)
        if sleep_sec > 0:
            time.sleep(sleep_sec)
        return data

    if client:
        return do_fetch(client)
    with httpx.Client(timeout=30.0) as c:
        return do_fetch(c)


def ingest_discourse_topic(
    topic_url: str,
    client: httpx.Client | None = None,
    db_path: Path | str | None = None,
    raw_dir: Path | None = None,
    sleep_sec: float = 1.0,
) -> Document:
    topic_id = extract_topic_id(topic_url)
    topic_json_url = f"https://discuss.python.org/t/{topic_id}.json"

    topic_data = make_discourse_request(
        topic_json_url, client=client, raw_dir=raw_dir, sleep_sec=sleep_sec
    )

    title = topic_data.get("title", f"Discourse Topic {topic_id}")
    created_at_str = topic_data.get("created_at")
    created_at = (
        datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        if created_at_str
        else datetime.now()
    )

    thread_id = f"discourse_{topic_id}"
    post_stream = topic_data.get("post_stream", {})
    all_post_ids: list[int] = post_stream.get("stream", [])
    initial_posts: list[dict[str, Any]] = post_stream.get("posts", [])

    posts_by_id: dict[int, dict[str, Any]] = {p["id"]: p for p in initial_posts if "id" in p}
    missing_ids = [pid for pid in all_post_ids if pid not in posts_by_id]

    # Fetch missing posts in batches of 20
    batch_size = 20
    for i in range(0, len(missing_ids), batch_size):
        batch = missing_ids[i : i + batch_size]
        query_params = "&".join(f"post_ids[]={pid}" for pid in batch)
        batch_url = f"https://discuss.python.org/t/{topic_id}/posts.json?{query_params}"
        try:
            batch_data = make_discourse_request(
                batch_url, client=client, raw_dir=raw_dir, sleep_sec=sleep_sec
            )
            for p in batch_data.get("post_stream", {}).get("posts", []):
                posts_by_id[p["id"]] = p
        except Exception as e:
            logger.warning(f"Error fetching batch of posts for topic {topic_id}: {e}")

    # Build comments ordered by post_number
    ordered_posts = sorted(
        posts_by_id.values(), key=lambda p: (p.get("post_number", 0), p.get("id", 0))
    )

    comments: list[Comment] = []
    max_updated_at: str | None = None

    for p in ordered_posts:
        username = p.get("username", "unknown")
        raw_body = p.get("cooked", "")
        clean_body = clean_html_to_text(raw_body)
        if not clean_body:
            continue

        p_created_at_str = p.get("created_at")
        p_created_at = (
            datetime.fromisoformat(p_created_at_str.replace("Z", "+00:00"))
            if p_created_at_str
            else created_at
        )
        updated_at_str = p.get("updated_at", p_created_at_str)
        if updated_at_str and (not max_updated_at or updated_at_str > max_updated_at):
            max_updated_at = updated_at_str

        post_num = p.get("post_number", 1)
        post_url = f"https://discuss.python.org/t/{topic_id}/{post_num}"

        resolve_canonical_person(
            "discourse",
            username,
            display_name=p.get("name"),
            db_path=db_path,
        )

        comments.append(
            Comment(
                comment_id=f"disc_p_{p['id']}",
                author_handle=username,
                author_email=None,
                posted_at=p_created_at,
                body=clean_body,
                url=post_url,
            )
        )

    canonical_topic_url = f"https://discuss.python.org/t/{topic_id}"
    doc = Document(
        thread_id=thread_id,
        platform="discourse",
        url=canonical_topic_url,
        title=title,
        created_at=created_at,
        comments=comments,
    )

    upsert_document(doc, db_path=db_path)

    if max_updated_at:
        upsert_cursor("discourse", topic_id, max_updated_at, db_path=db_path)

    return doc

