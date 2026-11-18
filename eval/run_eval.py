from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from core.config import settings
from core.db_sqlite import get_db, init_db
from core.models import Document
from eval.matcher import judge_match
from extract.extractor import extract_from_document
from ingest.discourse_ingest import extract_topic_id, ingest_discourse_topic

logger = logging.getLogger(__name__)


def assert_blindness(db_path: Path | str | None = None) -> None:
    """Strictly guarantees that no PEP text or document exists in the evaluation database."""
    conn = get_db(db_path)
    cursor = conn.execute(
        """
        SELECT count(*) as c FROM documents
        WHERE platform = 'pep' OR lower(thread_id) LIKE '%pep_text%';
        """
    )
    count = cursor.fetchone()["c"]
    conn.close()

    if count > 0:
        raise AssertionError(
            f"Blind Guarantee Violated! Found {count} PEP text documents in the evaluation database. "
            "Evaluation must be performed strictly blind from discussion threads alone."
        )


def evaluate_peps(
    peps_data: list[dict[str, Any]],
    db_path: Path | str | None = None,
    llm_judge_fn: Callable[[str], dict[str, Any]] | None = None,
    llm_extractor_fn: Callable[[str], list[dict[str, Any]]] | None = None,
    client: Any = None,
    raw_dir: Path | None = None,
    output_report_path: Path | str | None = None,
) -> dict[str, Any]:
    eval_db = db_path or settings.EVAL_DB_PATH
    init_db(eval_db)

    # 1. Enforce blindness before running
    assert_blindness(eval_db)

    results_per_pep: list[dict[str, Any]] = []
    total_ground_truth = 0
    total_recovered = 0
    total_predicted = 0
    total_valid_matches = 0

    conn = get_db(eval_db)

    for pep in peps_data:
        pep_number = pep["pep_number"]
        pep_title = pep.get("title", f"PEP {pep_number}")
        discourse_url = pep["discourse_url"]
        ground_truth_items = pep.get("rejected_ideas", [])

        # Check if thread is already in database (offline / pre-seeded cache)
        thread_id = f"discourse_{extract_topic_id(discourse_url)}"
        doc: Document | None = None

        cursor = conn.execute("SELECT raw_json FROM documents WHERE thread_id = ?", (thread_id,))
        row = cursor.fetchone()
        if row and row["raw_json"]:
            try:
                doc = Document.model_validate_json(row["raw_json"])
            except Exception as e:
                logger.warning(f"Could not load pre-existing document for {thread_id}: {e}")

        if not doc:
            try:
                doc = ingest_discourse_topic(
                    discourse_url,
                    client=client,
                    db_path=eval_db,
                    raw_dir=raw_dir,
                    sleep_sec=0,
                )
            except Exception as e:
                logger.error(f"Failed to ingest Discourse thread for PEP {pep_number}: {e}")
                continue

        # Double check blindness invariant after thread ingestion
        assert_blindness(eval_db)

        # Extract decisions blind
        decisions = extract_from_document(doc, llm_callable=llm_extractor_fn, db_path=eval_db)

        # Collect all predicted alternatives
        predicted_alternatives = []
        for d in decisions:
            for alt in d.alternatives:
                predicted_alternatives.append(alt)

        # Match ground truth items against predicted alternatives
        matched_gt_indices: set[int] = set()
        match_details: list[dict[str, Any]] = []

        for gt_idx, gt_item in enumerate(ground_truth_items):
            best_match = None
            highest_sim = 0.0

            for alt in predicted_alternatives:
                matched, sim, reason = judge_match(
                    ground_truth_item=gt_item,
                    predicted_alt_text=alt.text,
                    predicted_alt_reason=alt.reason,
                    llm_judge_fn=llm_judge_fn,
                )
                if sim > highest_sim:
                    highest_sim = sim
                if matched:
                    best_match = {
                        "gt_item": gt_item,
                        "matched_pred_text": alt.text,
                        "matched_pred_reason": alt.reason,
                        "similarity": sim,
                        "judge_reason": reason,
                    }
                    break

            if best_match:
                matched_gt_indices.add(gt_idx)
                match_details.append(best_match)

        gt_count = len(ground_truth_items)
        rec_count = len(matched_gt_indices)
        pred_count = len(predicted_alternatives)

        recall = rec_count / gt_count if gt_count > 0 else 0.0
        # Precision lower bound: matched items / total predicted items
        precision_lb = rec_count / pred_count if pred_count > 0 else 0.0

        total_ground_truth += gt_count
        total_recovered += rec_count
        total_predicted += pred_count

        pep_result = {
            "pep_number": pep_number,
            "title": pep_title,
            "ground_truth_count": gt_count,
            "predicted_count": pred_count,
            "matched_count": rec_count,
            "recall": round(recall, 3),
            "precision_lb": round(precision_lb, 3),
            "matches": match_details,
        }
        results_per_pep.append(pep_result)

        # Save to SQLite eval_results table
        with conn:
            conn.execute(
                """
                INSERT INTO eval_results (
                    pep_number, ground_truth_count, predicted_count, matched_count,
                    recall, precision, details, run_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    pep_number,
                    gt_count,
                    pred_count,
                    rec_count,
                    recall,
                    precision_lb,
                    json.dumps(match_details),
                    datetime.now().isoformat(),
                ),
            )

    conn.close()

    overall_recall = total_recovered / total_ground_truth if total_ground_truth > 0 else 0.0
    overall_precision = total_recovered / total_predicted if total_predicted > 0 else 0.0

    summary = {
        "total_peps_evaluated": len(results_per_pep),
        "total_ground_truth": total_ground_truth,
        "total_recovered": total_recovered,
        "overall_recall": round(overall_recall, 3),
        "overall_precision_lb": round(overall_precision, 3),
        "pep_results": results_per_pep,
    }

    # Write report to docs/eval_results.md
    report_file = Path(output_report_path or "docs/eval_results.md")
    report_file.parent.mkdir(parents=True, exist_ok=True)
    _write_markdown_report(summary, report_file)

    return summary


def _write_markdown_report(summary: dict[str, Any], path: Path) -> None:
    lines = [
        "# Blind PEP Evaluation Benchmark Results",
        "",
        "> **Methodology:** Discussion threads from python.org Discourse were fed blindly into DecisionTrail without exposing PEP texts to the ingestion store. Extracted rejected alternatives were matched against the official PEP 'Rejected Ideas' sections using dense embeddings (cosine $\\ge 0.60$) and LLM judge validation.",
        "",
        "## Summary Metrics",
        f"- **PEPs Evaluated:** {summary['total_peps_evaluated']}",
        f"- **Total Official Rejected Ideas (Ground Truth):** {summary['total_ground_truth']}",
        f"- **Recovered Rejected Alternatives:** {summary['total_recovered']}",
        f"- **Overall Recall:** **{summary['overall_recall'] * 100:.1f}%** (Target: >= 50%)",
        f"- **Precision Lower Bound:** **{summary['overall_precision_lb'] * 100:.1f}%** *(Lower bound because public threads discuss valid ideas omitted from the final PEP)*",
        "",
        "## Per-PEP Performance Breakdown",
        "",
        "| PEP # | Title | Ground Truth Items | Predicted Alternatives | Recovered | Recall | Precision (LB) |",
        "| :--- | :--- | :---: | :---: | :---: | :---: | :---: |",
    ]

    for p in summary["pep_results"]:
        lines.append(
            f"| PEP {p['pep_number']} | {p['title']} | {p['ground_truth_count']} | {p['predicted_count']} | {p['matched_count']} | {p['recall'] * 100:.1f}% | {p['precision_lb'] * 100:.1f}% |"
        )

    lines.append("\n## Recovered Alternative Alignments (Sample)")
    for p in summary["pep_results"]:
        if p["matches"]:
            lines.append(f"\n### PEP {p['pep_number']}: {p['title']}")
            for m in p["matches"]:
                lines.append(f"- **Ground Truth Idea:** *\"{m['gt_item']}\"*")
                lines.append(f"  - **Recovered from Forum:** *\"{m['matched_pred_text']}\"*")
                lines.append(f"  - **Judge Rationale:** {m['judge_reason']} *(Cosine: {m['similarity']:.2f})*")

    path.write_text("\n".join(lines), encoding="utf-8")
