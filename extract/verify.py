from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Any
from rapidfuzz import fuzz
from core.models import Comment, Decision, Evidence, RejectedAlternative

logger = logging.getLogger(__name__)


@dataclass
class VerificationStats:
    total_quotes_checked: int = 0
    passed_quotes: int = 0
    dropped_quotes: int = 0
    decisions_dropped_no_evidence: int = 0


def normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    # Collapse all whitespace and newlines to a single space
    return re.sub(r"\s+", " ", text).strip()


def verify_quote(quote: str, source_text: str, threshold: float = 95.0) -> bool:
    if not quote or not source_text:
        return False

    norm_quote = normalize_whitespace(quote)
    norm_source = normalize_whitespace(source_text)

    # Fast path: exact substring match
    if norm_quote.lower() in norm_source.lower():
        return True

    # Fuzzy partial ratio
    score = fuzz.partial_ratio(norm_quote.lower(), norm_source.lower())
    return score >= threshold


def verify_and_build_decision(
    candidate: dict[str, Any],
    thread_id: str,
    repo_or_forum: str,
    platform: str,
    comment_map: dict[str, Comment],
    extractor_model: str,
    threshold: float = 95.0,
    stats: VerificationStats | None = None,
) -> Decision | None:
    title = candidate.get("title", "").strip()
    outcome = candidate.get("outcome", "adopted").lower()
    if outcome not in ("adopted", "rejected", "reverted", "deferred"):
        outcome = "adopted"

    rationale = candidate.get("rationale", "").strip()
    confidence = float(candidate.get("confidence", 0.9))
    confidence = max(0.0, min(1.0, confidence))

    decision_evidence: list[Evidence] = []

    # 1. Verify primary decision quote
    primary_quote = candidate.get("quote", "").strip()
    primary_comment_id = str(candidate.get("comment_id", "")).strip()

    if stats:
        stats.total_quotes_checked += 1

    primary_comment = comment_map.get(primary_comment_id)
    if primary_comment and verify_quote(primary_quote, primary_comment.body, threshold):
        decision_evidence.append(
            Evidence(
                source_url=primary_comment.url,
                platform=platform,  # type: ignore[arg-type]
                author_handle=primary_comment.author_handle,
                posted_at=primary_comment.posted_at,
                quote=primary_quote,
            )
        )
        if stats:
            stats.passed_quotes += 1
    else:
        logger.warning(
            f"Decision quote failed verification for '{title}': '{primary_quote[:50]}...'"
        )
        if stats:
            stats.dropped_quotes += 1

    # 2. Verify rejected alternatives
    verified_alternatives: list[RejectedAlternative] = []
    for alt in candidate.get("alternatives", []):
        alt_text = alt.get("text", "").strip()
        alt_reason = alt.get("reason", "").strip()
        alt_quote = alt.get("quote", "").strip()
        alt_comment_id = str(alt.get("comment_id", "")).strip()

        if stats:
            stats.total_quotes_checked += 1

        alt_comment = comment_map.get(alt_comment_id)
        if alt_comment and verify_quote(alt_quote, alt_comment.body, threshold):
            alt_ev = Evidence(
                source_url=alt_comment.url,
                platform=platform,  # type: ignore[arg-type]
                author_handle=alt_comment.author_handle,
                posted_at=alt_comment.posted_at,
                quote=alt_quote,
            )
            verified_alternatives.append(
                RejectedAlternative(
                    text=alt_text,
                    reason=alt_reason,
                    evidence=alt_ev,
                )
            )
            # If primary quote failed, but we have an alternative with valid evidence,
            # use it so the decision has supporting evidence
            if not decision_evidence:
                decision_evidence.append(alt_ev)

            if stats:
                stats.passed_quotes += 1
        else:
            logger.warning(
                f"Alternative quote failed verification: '{alt_quote[:50]}...'"
            )
            if stats:
                stats.dropped_quotes += 1

    # 3. Non-negotiable check: Decision must have at least one verified evidence item
    if not decision_evidence:
        logger.info(f"Discarding decision '{title}' due to lack of verified evidence.")
        if stats:
            stats.decisions_dropped_no_evidence += 1
        return None

    # Deterministic SHA1 ID based on thread_id + normalized title
    norm_title = re.sub(r"[^a-zA-Z0-9]+", "_", title.lower()).strip("_")
    decision_id = hashlib.sha1(f"{thread_id}:{norm_title}".encode("utf-8")).hexdigest()

    # Determine decided_at from latest evidence
    decided_at = max(e.posted_at for e in decision_evidence)

    return Decision(
        id=decision_id,
        repo_or_forum=repo_or_forum,
        thread_id=thread_id,
        title=title,
        outcome=outcome,  # type: ignore[arg-type]
        rationale=rationale,
        alternatives=verified_alternatives,
        evidence=decision_evidence,
        confidence=confidence,
        decided_at=decided_at,
        linked_paths=[],
        extractor_model=extractor_model,
    )

