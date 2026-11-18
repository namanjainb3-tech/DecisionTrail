from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Callable
from core.config import settings
from core.db_sqlite import save_decision
from core.llm import complete_json
from core.models import Decision, Document
from extract.chunking import chunk_document
from extract.filter import filter_chunks, FilterStats
from extract.prompts import EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT
from extract.verify import verify_and_build_decision, VerificationStats

logger = logging.getLogger(__name__)


def merge_decisions(decisions: list[Decision]) -> list[Decision]:
    """Merges decisions from different chunks of the same thread that share the same decision ID."""
    if not decisions:
        return []

    grouped: dict[str, list[Decision]] = {}
    for d in decisions:
        grouped.setdefault(d.id, []).append(d)

    merged: list[Decision] = []
    for dec_id, group in grouped.items():
        if len(group) == 1:
            merged.append(group[0])
            continue

        base = group[0]
        all_evidence = list(base.evidence)
        seen_quotes = {e.quote.strip().lower() for e in all_evidence}

        all_alts = list(base.alternatives)
        seen_alts = {a.text.strip().lower() for a in all_alts}

        total_conf = base.confidence
        max_decided_at = base.decided_at

        for other in group[1:]:
            total_conf += other.confidence
            if other.decided_at and (not max_decided_at or other.decided_at > max_decided_at):
                max_decided_at = other.decided_at

            for ev in other.evidence:
                q_key = ev.quote.strip().lower()
                if q_key not in seen_quotes:
                    all_evidence.append(ev)
                    seen_quotes.add(q_key)

            for alt in other.alternatives:
                a_key = alt.text.strip().lower()
                if a_key not in seen_alts:
                    all_alts.append(alt)
                    seen_alts.add(a_key)

        merged.append(
            Decision(
                id=base.id,
                repo_or_forum=base.repo_or_forum,
                thread_id=base.thread_id,
                title=base.title,
                outcome=base.outcome,
                rationale=base.rationale,
                alternatives=all_alts,
                evidence=all_evidence,
                confidence=round(total_conf / len(group), 3),
                decided_at=max_decided_at,
                linked_paths=base.linked_paths,
                extractor_model=base.extractor_model,
            )
        )

    return merged


def extract_from_document(
    doc: Document,
    llm_callable: Callable[[str], list[dict[str, Any]]] | None = None,
    db_path: Path | str | None = None,
    filter_stats: FilterStats | None = None,
    verify_stats: VerificationStats | None = None,
    extractor_model: str | None = None,
) -> list[Decision]:
    """Runs the full extraction pipeline: Chunking -> Heuristic Filtering -> LLM Extraction -> Quote Verification -> Merging -> Persistence."""
    model_name = extractor_model or settings.LLM_PRIMARY_MODEL

    chunks = chunk_document(doc)
    if not chunks:
        return []

    passed_chunks = filter_chunks(chunks, stats=filter_stats)
    if not passed_chunks:
        return []

    raw_decisions: list[Decision] = []

    for chunk in passed_chunks:
        prompt = EXTRACTION_USER_PROMPT.format(chunk_text=chunk.text)
        candidates: list[dict[str, Any]] = []

        if llm_callable:
            candidates = llm_callable(prompt)
        else:
            try:
                candidates = complete_json(
                    prompt=prompt,
                    system_prompt=EXTRACTION_SYSTEM_PROMPT,
                    model=model_name,
                )
            except Exception as e:
                logger.error(f"LLM extraction failed on chunk {chunk.chunk_id}: {e}")
                candidates = []

        if not isinstance(candidates, list):
            if isinstance(candidates, dict):
                candidates = [candidates]
            else:
                candidates = []

        repo_or_forum = doc.platform
        if "github" in doc.platform:
            # e.g. github_psf/black_101 -> psf/black
            parts = doc.thread_id.split("_")
            if len(parts) >= 3:
                repo_or_forum = parts[1]

        for cand in candidates:
            if not isinstance(cand, dict):
                continue
            decision = verify_and_build_decision(
                candidate=cand,
                thread_id=doc.thread_id,
                repo_or_forum=repo_or_forum,
                platform=doc.platform,
                comment_map=chunk.comment_map,
                extractor_model=model_name,
                stats=verify_stats,
            )
            if decision:
                raw_decisions.append(decision)

    merged = merge_decisions(raw_decisions)

    # Persist verified decisions into SQLite
    for d in merged:
        save_decision(d, db_path=db_path)

    return merged


def run_extraction_pipeline(
    thread_ids: list[str] | None = None,
    limit: int = 100,
    db_path: Path | str | None = None,
    extractor_model: str | None = None,
) -> list[Decision]:
    from core.db_sqlite import get_documents

    docs = get_documents(thread_ids=thread_ids, limit=limit, db_path=db_path)
    all_decisions: list[Decision] = []
    for doc in docs:
        decs = extract_from_document(
            doc=doc,
            db_path=db_path,
            extractor_model=extractor_model,
        )
        all_decisions.extend(decs)
    return all_decisions

