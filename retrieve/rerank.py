from __future__ import annotations

import logging
from typing import Any
from memory.feedback_memory import FeedbackMemory, get_feedback_memory

logger = logging.getLogger(__name__)


def rerank_candidates(
    candidates: list[dict[str, Any]],
    paths: list[str],
    feedback_memory: FeedbackMemory | None = None,
    threshold: float = 0.35,
    max_results: int = 3,
) -> list[dict[str, Any]]:
    if not candidates:
        return []

    memory = feedback_memory or get_feedback_memory()
    score_adjustments = memory.adjustments(paths)
    feedback_notes = memory.get_notes(paths)

    reranked: list[dict[str, Any]] = []

    for item in candidates:
        dec_id = item.get("id") or item.get("decision", {}).get("id")
        base_score = item.get("score", 0.0)

        adjustment = score_adjustments.get(dec_id, 0.0)
        # Check if suppressed (outdated)
        if adjustment <= -900:
            logger.info(f"Suppressing decision {dec_id} due to 'outdated' verdict.")
            continue

        adjusted_score = base_score + adjustment

        # Strict Threshold check: Showing nothing is better than showing noise
        if adjusted_score < threshold:
            continue

        item["score"] = adjusted_score
        if dec_id in feedback_notes:
            item["maintainer_note"] = feedback_notes[dec_id]

        reranked.append(item)

    reranked.sort(key=lambda x: x["score"], reverse=True)
    return reranked[:max_results]
