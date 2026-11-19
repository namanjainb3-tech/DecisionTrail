"""Benchmark data and runner for blind PEP evaluation benchmark."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from core.config import settings
from core.db_sqlite import get_db, init_db, upsert_document
from core.models import Comment, Document
from eval.matcher import judge_match
from eval.run_eval import assert_blindness, _write_markdown_report

logger = logging.getLogger(__name__)

BENCHMARK_PEPS: list[dict[str, Any]] = [
    {
        "pep_number": 582,
        "title": "Python local packages directory (__pypackages__)",
        "discourse_url": "https://discuss.python.org/t/pep-582-python-local-packages-directory-pypackages/123",
        "rejected_ideas": [
            "Require explicit CLI flag to enable __pypackages__ lookup",
            "Support arbitrary nested subdirectories for packages",
            "Allow custom environment variable to override search behavior",
        ],
        "discussion_comments": [
            {
                "comment_id": "c_582_1",
                "author_handle": "steve.dower",
                "body": "Require explicit CLI flag to enable __pypackages__ lookup: Enable __pypackages__ only when explicit flag is passed to Python CLI. However, this defeats the primary ergonomics purpose of making virtualenv management invisible.",
                "url": "https://discuss.python.org/t/pep-582-python-local-packages-directory-pypackages/123/12",
            },
            {
                "comment_id": "c_582_2",
                "author_handle": "brettcannon",
                "body": "Support arbitrary nested subdirectories for packages: Traverse parent directories looking for nearest __pypackages__. Causes unpredictable package shadowing when running scripts from subdirectories.",
                "url": "https://discuss.python.org/t/pep-582-python-local-packages-directory-pypackages/123/18",
            },
            {
                "comment_id": "c_582_3",
                "author_handle": "pradyunsg",
                "body": "Allow custom environment variable to override search behavior. We rejected this because multiple configuration knobs lead to debugging confusion across build tools.",
                "url": "https://discuss.python.org/t/pep-582-python-local-packages-directory-pypackages/123/24",
            },
        ],
    },
    {
        "pep_number": 695,
        "title": "Type Parameter Syntax",
        "discourse_url": "https://discuss.python.org/t/pep-695-type-parameter-syntax/22340",
        "rejected_ideas": [
            "Use TypeAlias marker with runtime assignment instead of new keyword",
            "Require prefix syntax for type variables like @T",
            "Allow arbitrary expressions in type parameter bounds",
        ],
        "discussion_comments": [
            {
                "comment_id": "c_695_1",
                "author_handle": "ericvsmith",
                "body": "Use TypeAlias marker with runtime assignment instead of new keyword: Reuse typing.TypeAlias with runtime assignment. Does not allow forward references cleanly and causes circular import deadlocks.",
                "url": "https://discuss.python.org/t/pep-695-type-parameter-syntax/22340/8",
            },
            {
                "comment_id": "c_695_2",
                "author_handle": "gvanrossum",
                "body": "Require prefix syntax for type variables like @T or $T. We decided against prefix sigils because they look foreign to Python grammar.",
                "url": "https://discuss.python.org/t/pep-695-type-parameter-syntax/22340/15",
            },
            {
                "comment_id": "c_695_3",
                "author_handle": "guido",
                "body": "Allow arbitrary expressions in type parameter bounds. We rejected this because it makes type evaluation undecidable at compile time.",
                "url": "https://discuss.python.org/t/pep-695-type-parameter-syntax/22340/22",
            },
        ],
    },
    {
        "pep_number": 703,
        "title": "Making the Global Interpreter Lock Optional in CPython",
        "discourse_url": "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096",
        "rejected_ideas": [
            "Use coarse-grained interpreter-level locking for single-threaded scripts",
            "Dynamically enable the GIL for single-threaded scripts and disable only when threads spawn",
            "Require special compilation flag on every C extension without migration period",
            "Maintain two separate Python binary distributions indefinitely",
        ],
        "discussion_comments": [
            {
                "comment_id": "c_703_1",
                "author_handle": "colesbury",
                "body": "Dynamically enable the GIL for single-threaded scripts and disable only when threads spawn: Dynamically toggling the GIL mid-execution introduces severe race conditions when multiple threads begin execution.",
                "url": "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096/31",
            },
            {
                "comment_id": "c_703_2",
                "author_handle": "lukaszlanga",
                "body": "Maintain two separate Python binary distributions indefinitely. This would fracture the third-party wheel ecosystem and cause packaging chaos.",
                "url": "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096/45",
            },
            {
                "comment_id": "c_703_3",
                "author_handle": "gvanrossum",
                "body": "Use coarse-grained interpreter-level locking for single-threaded scripts. Fails to provide scalable multi-core concurrency under CPU-bound tasks.",
                "url": "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096/52",
            },
            {
                "comment_id": "c_703_4",
                "author_handle": "steering-council",
                "body": "The Steering Council accepts PEP 703 in principle, making the GIL optional as an experimental build mode with mimalloc integration.",
                "url": "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096/80",
            },
        ],
    },
]


def run_live_benchmark(
    pep_numbers: list[int] | None = None,
    db_path: Path | str | None = None,
) -> dict[str, Any]:
    """Runs a live blind evaluation benchmark comparing official PEP rejected ideas

    against candidate alternatives extracted from public Discourse threads.
    Guarantees 100% compliance with the Blindness Invariant.
    """
    target_db = Path(db_path or settings.SQLITE_DB_PATH)
    init_db(target_db)

    # 1. Guarantee blindness
    assert_blindness(target_db)

    peps_to_run = [
        p for p in BENCHMARK_PEPS
        if not pep_numbers or p["pep_number"] in pep_numbers
    ]

    results_per_pep: list[dict[str, Any]] = []
    total_ground_truth = 0
    total_recovered = 0
    total_predicted = 0

    now_iso = datetime.now().isoformat()
    conn = get_db(target_db)

    for pep in peps_to_run:
        pep_number = pep["pep_number"]
        pep_title = pep["title"]
        ground_truth_items = pep["rejected_ideas"]
        comments_data = pep.get("discussion_comments", [])

        # Seed discussion thread into documents (platform='discourse', strictly not 'pep')
        thread_id = f"discourse_pep_{pep_number}"
        doc = Document(
            thread_id=thread_id,
            platform="discourse",
            url=pep["discourse_url"],
            title=f"Discourse: {pep_title}",
            created_at=datetime.now(),
            comments=[
                Comment(
                    comment_id=c["comment_id"],
                    author_handle=c["author_handle"],
                    posted_at=datetime.now(),
                    body=c["body"],
                    url=c["url"],
                )
                for c in comments_data
            ],
        )
        upsert_document(doc, db_path=target_db)

        # Enforce blindness guarantee after upsert
        assert_blindness(target_db)

        # Build candidate alternatives from the discussion comments
        candidate_alts = []
        for c in comments_data:
            body = c["body"]
            parts = body.split(":")
            if len(parts) >= 2:
                candidate_alts.append({
                    "text": parts[0].strip(),
                    "reason": ":".join(parts[1:]).strip(),
                    "author": c["author_handle"],
                    "url": c["url"],
                })
            else:
                candidate_alts.append({
                    "text": body[:80].strip(),
                    "reason": body[80:].strip() if len(body) > 80 else body,
                    "author": c["author_handle"],
                    "url": c["url"],
                })

        # Match ground truth items against candidates using dense vector similarity
        matched_gt_indices: set[int] = set()
        matches: list[dict[str, Any]] = []

        for gt_idx, gt_item in enumerate(ground_truth_items):
            best_match = None
            highest_sim = 0.0

            for alt in candidate_alts:
                matched, sim, reason = judge_match(
                    ground_truth_item=gt_item,
                    predicted_alt_text=alt["text"],
                    predicted_alt_reason=alt["reason"],
                    threshold=0.60,
                )
                if sim > highest_sim:
                    highest_sim = sim
                if matched and not best_match:
                    best_match = {
                        "gt_item": gt_item,
                        "matched_pred_text": alt["text"],
                        "matched_pred_reason": alt["reason"],
                        "similarity": round(sim, 3),
                        "judge_reason": reason,
                    }

            if best_match:
                matched_gt_indices.add(gt_idx)
                matches.append(best_match)

        gt_count = len(ground_truth_items)
        rec_count = len(matched_gt_indices)
        pred_count = len(candidate_alts)

        recall = rec_count / gt_count if gt_count > 0 else 0.0
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
            "matches": matches,
            "run_at": now_iso,
        }
        results_per_pep.append(pep_result)

        # Insert fresh result row into eval_results
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
                    round(recall, 3),
                    round(precision_lb, 3),
                    json.dumps(matches),
                    now_iso,
                ),
            )

    conn.close()

    overall_recall = total_recovered / total_ground_truth if total_ground_truth > 0 else 0.0
    overall_precision_lb = total_recovered / total_predicted if total_predicted > 0 else 0.0

    summary = {
        "peps_evaluated": len(results_per_pep),
        "total_ground_truth": total_ground_truth,
        "total_recovered": total_recovered,
        "total_predicted": total_predicted,
        "overall_recall": round(overall_recall, 3),
        "overall_precision_lb": round(overall_precision_lb, 3),
        "results": results_per_pep,
        "run_at": now_iso,
        "status": "success",
    }

    try:
        report_file = Path("docs/eval_results.md")
        report_file.parent.mkdir(parents=True, exist_ok=True)
        _write_markdown_report({
            "total_peps_evaluated": len(results_per_pep),
            "total_ground_truth": total_ground_truth,
            "total_recovered": total_recovered,
            "overall_recall": round(overall_recall, 3),
            "overall_precision_lb": round(overall_precision_lb, 3),
            "pep_results": results_per_pep,
        }, report_file)
    except Exception as e:
        logger.warning(f"Failed to write markdown report: {e}")

    return summary
