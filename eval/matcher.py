from __future__ import annotations

import logging
from typing import Any, Callable
from core.llm import complete_json
from retrieve.embeddings import cosine_similarity, embed_text

logger = logging.getLogger(__name__)

JUDGE_PROMPT_TEMPLATE = """You are an impartial academic judge evaluating whether two statements describe the same rejected technical idea.

Statement A (Official PEP 'Rejected Ideas' text):
\"\"\"{ground_truth_item}\"\"\"

Statement B (Candidate rejected alternative extracted from public discussion thread):
\"\"\"{predicted_alt_text}\"\"\"
Reason given in discussion:
\"\"\"{predicted_alt_reason}\"\"\"

Question:
Do Statement A and Statement B describe essentially the same rejected technical concept or design alternative?

Respond with ONLY a JSON object:
{{
  "match": true | false,
  "reason": "One sentence explaining why they match or why they are fundamentally different"
}}
"""


def judge_match(
    ground_truth_item: str,
    predicted_alt_text: str,
    predicted_alt_reason: str,
    llm_judge_fn: Callable[[str], dict[str, Any]] | None = None,
    threshold: float = 0.60,
) -> tuple[bool, float, str]:
    """Two-stage match evaluator: (1) Dense vector cosine similarity >= 0.60, (2) LLM Judge confirmation."""
    gt_vec = embed_text(ground_truth_item)
    pred_vec = embed_text(f"{predicted_alt_text}. Reason: {predicted_alt_reason}")
    sim = cosine_similarity(gt_vec, pred_vec)

    # Stage 1: Cosine Filter
    if sim < threshold:
        return (False, sim, f"Embedding similarity {sim:.3f} below {threshold} threshold")

    # Stage 2: LLM Judge
    prompt = JUDGE_PROMPT_TEMPLATE.format(
        ground_truth_item=ground_truth_item,
        predicted_alt_text=predicted_alt_text,
        predicted_alt_reason=predicted_alt_reason,
    )

    if llm_judge_fn:
        try:
            resp = llm_judge_fn(prompt)
            matched = bool(resp.get("match", False))
            reason = str(resp.get("reason", "Judged by custom evaluator"))
            return (matched, sim, reason)
        except Exception as e:
            logger.warning(f"Custom LLM judge failed: {e}")

    try:
        resp = complete_json(
            prompt=prompt,
            system_prompt="You are a strict, objective technical judge. Return only JSON.",
        )
        matched = bool(resp.get("match", False))
        reason = str(resp.get("reason", ""))
        return (matched, sim, reason)
    except Exception as e:
        logger.info(f"LLM judge unavailable ({e}). Using cosine similarity >= 0.70 heuristic fallback.")
        # If no API key or offline, consider sim >= 0.70 as match
        matched = sim >= 0.70
        reason = f"Fallback cosine similarity {sim:.3f} (>= 0.70)"
        return (matched, sim, reason)
