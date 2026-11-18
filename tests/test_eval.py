from datetime import datetime
from pathlib import Path
import pytest
from core.db_sqlite import get_db, init_db
from core.models import Comment, Document
from eval.matcher import judge_match
from eval.pep_loader import extract_discourse_url_from_headers, parse_rejected_ideas_section
from eval.run_eval import assert_blindness, evaluate_peps


def test_parse_discourse_url_and_rejected_ideas():
    header_sample = """PEP: 622
Title: Structural Pattern Matching
Author: Brandt Bucher, Guido van Rossum
Post-History: 23-Jun-2020 (https://discuss.python.org/t/pep-622-structural-pattern-matching/4700)
Status: Superseded
"""
    url = extract_discourse_url_from_headers(header_sample)
    assert url == "https://discuss.python.org/t/pep-622-structural-pattern-matching/4700"

    body_sample = """
## Rejected Ideas

### Use switch keyword
We rejected using the switch keyword because of confusion with C semantics and fallthrough.

### Custom pattern syntax extensions
We decided against allowing third-party libraries to define custom pattern grammar at this stage.

## References
Some reference links.
"""
    items = parse_rejected_ideas_section(body_sample)
    assert len(items) >= 2
    assert any("switch keyword" in it.lower() for it in items)
    assert any("custom pattern" in it.lower() for it in items)


def test_matcher_cosine_and_judge():
    gt = "Use switch keyword instead of match block"
    pred_text = "Use switch keyword for pattern matching"
    pred_reason = "Ambiguity with C-style switch semantics and fallthrough"

    def mock_judge(prompt: str):
        return {"match": True, "reason": "Both describe using switch keyword rather than match block"}

    matched, sim, reason = judge_match(gt, pred_text, pred_reason, llm_judge_fn=mock_judge)
    assert matched is True
    assert sim >= 0.60
    assert "switch" in reason.lower()


def test_blind_assertion_fires_if_pep_in_database(tmp_path: Path):
    eval_db = tmp_path / "eval_test.db"
    init_db(eval_db)

    # Clean database passes blindness check
    assert_blindness(eval_db)

    # Adversarially insert a PEP document
    conn = get_db(eval_db)
    with conn:
        conn.execute(
            """
            INSERT INTO documents (thread_id, platform, url, title, created_at, raw_json)
            VALUES ('pep_622_doc', 'pep', 'https://peps.python.org/pep-0622/', 'PEP 622', '2020-01-01', '{}');
            """
        )
    conn.close()

    # Blindness assertion must strictly fire!
    with pytest.raises(AssertionError) as exc_info:
        assert_blindness(eval_db)
    assert "Blind Guarantee Violated" in str(exc_info.value)


def test_run_eval_end_to_end_on_2_peps(tmp_path: Path):
    eval_db = tmp_path / "eval_end_to_end.db"
    report_file = tmp_path / "eval_results.md"
    init_db(eval_db)

    # Pre-populate Discourse discussion threads for 2 PEPs
    c1 = Comment(
        comment_id="p622_c1",
        author_handle="gvanrossum",
        posted_at=datetime.now(),
        body="We rejected using switch keyword because of ambiguity with C semantics.",
        url="https://discuss.python.org/t/4700/1"
    )
    doc_622 = Document(
        thread_id="discourse_4700",
        platform="discourse",
        url="https://discuss.python.org/t/4700",
        title="PEP 622: Structural Pattern Matching",
        created_at=datetime.now(),
        comments=[c1]
    )

    c2 = Comment(
        comment_id="p634_c1",
        author_handle="brandtbucher",
        posted_at=datetime.now(),
        body="We decided against allowing custom grammar extensions in pattern matching.",
        url="https://discuss.python.org/t/5500/1"
    )
    doc_634 = Document(
        thread_id="discourse_5500",
        platform="discourse",
        url="https://discuss.python.org/t/5500",
        title="PEP 634: Specification",
        created_at=datetime.now(),
        comments=[c2]
    )

    from core.db_sqlite import upsert_document
    upsert_document(doc_622, db_path=eval_db)
    upsert_document(doc_634, db_path=eval_db)

    # Synthetic PEP metadata
    peps_data = [
        {
            "pep_number": 622,
            "title": "Structural Pattern Matching",
            "discourse_url": "https://discuss.python.org/t/4700",
            "rejected_ideas": ["Use switch keyword instead of match"]
        },
        {
            "pep_number": 634,
            "title": "Pattern Matching Specification",
            "discourse_url": "https://discuss.python.org/t/5500",
            "rejected_ideas": ["Allow arbitrary custom pattern grammar syntax"]
        }
    ]

    def mock_extractor(prompt: str):
        if "4700" in prompt or "p622_c1" in prompt:
            return [
                {
                    "title": "Use match statement for pattern matching",
                    "outcome": "adopted",
                    "rationale": "Cleaner grammar",
                    "quote": "We rejected using switch keyword because of ambiguity with C semantics.",
                    "comment_id": "p622_c1",
                    "confidence": 0.95,
                    "alternatives": [
                        {
                            "text": "Use switch keyword for pattern matching",
                            "reason": "Ambiguity with C semantics",
                            "quote": "We rejected using switch keyword because of ambiguity with C semantics.",
                            "comment_id": "p622_c1"
                        }
                    ]
                }
            ]
        else:
            return [
                {
                    "title": "Finalize pattern matching specification",
                    "outcome": "adopted",
                    "rationale": "Formal grammar rules",
                    "quote": "We decided against allowing custom grammar extensions in pattern matching.",
                    "comment_id": "p634_c1",
                    "confidence": 0.95,
                    "alternatives": [
                        {
                            "text": "Allow arbitrary custom pattern grammar syntax",
                            "reason": "Too complex at this stage",
                            "quote": "We decided against allowing custom grammar extensions in pattern matching.",
                            "comment_id": "p634_c1"
                        }
                    ]
                }
            ]

    def mock_judge(prompt: str):
        return {"match": True, "reason": "Consistent rejection concept"}

    summary = evaluate_peps(
        peps_data=peps_data,
        db_path=eval_db,
        llm_judge_fn=mock_judge,
        llm_extractor_fn=mock_extractor,
        output_report_path=report_file
    )

    assert summary["total_peps_evaluated"] == 2
    assert summary["total_ground_truth"] == 2
    assert summary["total_recovered"] >= 1
    assert summary["overall_recall"] >= 0.50

    # Verify persisted in SQLite eval_results
    conn = get_db(eval_db)
    rows = conn.execute("SELECT * FROM eval_results").fetchall()
    conn.close()
    assert len(rows) == 2

    # Verify report file was written
    assert report_file.exists()
    report_content = report_file.read_text(encoding="utf-8")
    assert "Blind PEP Evaluation Benchmark Results" in report_content
    assert "Overall Recall" in report_content
