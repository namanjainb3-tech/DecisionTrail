from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from core.config import settings
from bot.render import render_bot_comment
from memory.feedback_memory import FeedbackMemory, get_feedback_memory
from retrieve.rerank import rerank_candidates
from retrieve.search import search_candidates

logger = logging.getLogger(__name__)


def check_repo_allowlist(repo: str) -> None:
    allowed_list = [
        r.strip().lower()
        for r in settings.ALLOWED_POST_REPOS.split(",")
        if r.strip()
    ]
    if repo.strip().lower() not in allowed_list:
        raise PermissionError(
            f"Security Violation: Refusing to post automated comments to unauthorized repository '{repo}'. "
            f"Repository must be explicitly listed in ALLOWED_POST_REPOS: {allowed_list}"
        )


def analyze_pr(
    repo: str,
    changed_files: list[str],
    pr_title: str = "",
    pr_diff_summary: str = "",
    post_to_github: bool = False,
    threshold: float = 0.35,
    max_results: int = 3,
    driver: Any = None,
    db_path: Path | str | None = None,
    feedback_memory: FeedbackMemory | None = None,
) -> dict[str, Any]:
    if post_to_github:
        check_repo_allowlist(repo)

    candidates = search_candidates(
        changed_files=changed_files,
        pr_title=pr_title,
        pr_diff_summary=pr_diff_summary,
        driver=driver,
        db_path=db_path,
    )

    memory = feedback_memory or get_feedback_memory(db_path=db_path)
    top_decisions = rerank_candidates(
        candidates=candidates,
        paths=changed_files,
        feedback_memory=memory,
        threshold=threshold,
        max_results=max_results,
    )

    comment_markdown = render_bot_comment(top_decisions)

    return {
        "repo": repo,
        "changed_files": changed_files,
        "pr_title": pr_title,
        "decisions": top_decisions,
        "comment_markdown": comment_markdown,
    }
