import json
from datetime import datetime
from pathlib import Path
import pytest
from core.db_sqlite import get_decisions, init_db
from core.models import Comment, Document
from extract.chunking import chunk_document
from extract.extractor import extract_from_document, merge_decisions
from extract.filter import FilterStats, matches_decision_cues
from extract.verify import VerificationStats, verify_quote


def test_heuristic_filter_cues():
    has_cue, cues = matches_decision_cues("After discussion, we decided to drop support for Python 2.")
    assert has_cue is True
    assert len(cues) >= 1

    has_cue2, cues2 = matches_decision_cues("Can anyone review this PR? Thanks!")
    assert has_cue2 is False
    assert len(cues2) == 0


def test_quote_verification():
    source_body = "We decided against supporting Python 2.7 because it is completely end-of-life."
    # Exact quote
    assert verify_quote("We decided against supporting Python 2.7", source_body) is True
    # Minor whitespace difference
    assert verify_quote("  we  decided against supporting   python 2.7  ", source_body) is True
    # Fabricated hallucinated quote
    assert verify_quote("Python 2.7 is our favorite release ever", source_body) is False


def test_extraction_pipeline_drops_fabricated_quote(tmp_path: Path):
    db_path = tmp_path / "test_extract.db"
    init_db(db_path)

    c1 = Comment(
        comment_id="c_1",
        author_handle="ambv",
        posted_at=datetime.now(),
        body="We decided to use pathlib because os.path has subtle bugs on Windows paths.",
        url="https://github.com/psf/black/issues/101#1"
    )
    doc = Document(
        thread_id="thread_101",
        platform="github_issue",
        url="https://github.com/psf/black/issues/101",
        title="Pathlib migration",
        created_at=datetime.now(),
        comments=[c1]
    )

    # Fake LLM response with a completely fabricated quote
    def fake_llm_fabricated(prompt: str):
        return [
            {
                "title": "Use os.path instead of pathlib",
                "outcome": "rejected",
                "rationale": "Hallucinated consensus",
                "quote": "We never want to use pathlib anywhere in Black",  # Fabricated!
                "comment_id": "c_1",
                "confidence": 0.9,
                "alternatives": []
            }
        ]

    verify_stats = VerificationStats()
    decisions = extract_from_document(
        doc,
        llm_callable=fake_llm_fabricated,
        db_path=db_path,
        verify_stats=verify_stats
    )

    # Must be dropped!
    assert len(decisions) == 0
    assert verify_stats.dropped_quotes == 1
    assert verify_stats.decisions_dropped_no_evidence == 1


def test_extraction_pipeline_accepts_valid_quote_and_alternative(tmp_path: Path):
    db_path = tmp_path / "test_extract.db"
    init_db(db_path)

    c1 = Comment(
        comment_id="c_1",
        author_handle="ambv",
        posted_at=datetime.now(),
        body="We decided to adopt pathlib. We considered keeping os.path with a custom wrapper, but rejected it because it broke on UNC paths.",
        url="https://github.com/psf/black/issues/101#1"
    )
    doc = Document(
        thread_id="thread_101",
        platform="github_issue",
        url="https://github.com/psf/black/issues/101",
        title="Pathlib migration",
        created_at=datetime.now(),
        comments=[c1]
    )

    def fake_llm_valid(prompt: str):
        return [
            {
                "title": "Adopt pathlib for path handling",
                "outcome": "adopted",
                "rationale": "Cleaner cross-platform compatibility",
                "quote": "We decided to adopt pathlib",
                "comment_id": "c_1",
                "confidence": 0.95,
                "alternatives": [
                    {
                        "text": "Keep os.path with custom wrapper",
                        "reason": "Broke on UNC paths",
                        "quote": "rejected it because it broke on UNC paths",
                        "comment_id": "c_1"
                    }
                ]
            }
        ]

    verify_stats = VerificationStats()
    decisions = extract_from_document(
        doc,
        llm_callable=fake_llm_valid,
        db_path=db_path,
        verify_stats=verify_stats
    )

    assert len(decisions) == 1
    d = decisions[0]
    assert d.title == "Adopt pathlib for path handling"
    assert d.outcome == "adopted"
    assert len(d.evidence) == 1
    assert d.evidence[0].quote == "We decided to adopt pathlib"
    assert len(d.alternatives) == 1
    assert d.alternatives[0].reason == "Broke on UNC paths"
    assert d.alternatives[0].evidence.quote == "rejected it because it broke on UNC paths"

    # Verify persisted in SQLite
    stored = get_decisions(db_path=db_path)
    assert len(stored) == 1
    assert stored[0]["id"] == d.id
    assert stored[0]["outcome"] == "adopted"


def test_merge_decisions_combines_evidence():
    from core.models import Evidence, Decision
    ev1 = Evidence(
        source_url="https://github.com/psf/black/issues/101#1",
        platform="github_issue",
        author_handle="ambv",
        posted_at=datetime(2021, 5, 1),
        quote="We decided on pathlib."
    )
    ev2 = Evidence(
        source_url="https://github.com/psf/black/issues/101#2",
        platform="github_issue",
        author_handle="gvanrossum",
        posted_at=datetime(2021, 5, 2),
        quote="Pathlib is indeed much better."
    )
    d1 = Decision(
        id="shared_decision_id",
        repo_or_forum="psf/black",
        thread_id="thread_101",
        title="Use pathlib",
        outcome="adopted",
        rationale="Cross-platform consistency",
        alternatives=[],
        evidence=[ev1],
        confidence=0.9,
        decided_at=datetime(2021, 5, 1),
        linked_paths=[],
        extractor_model="gpt-oss-20b"
    )
    d2 = Decision(
        id="shared_decision_id",
        repo_or_forum="psf/black",
        thread_id="thread_101",
        title="Use pathlib",
        outcome="adopted",
        rationale="Better architecture",
        alternatives=[],
        evidence=[ev2],
        confidence=0.95,
        decided_at=datetime(2021, 5, 2),
        linked_paths=[],
        extractor_model="gpt-oss-20b"
    )
    merged = merge_decisions([d1, d2])
    assert len(merged) == 1
    assert len(merged[0].evidence) == 2
    assert merged[0].confidence == 0.925
    assert merged[0].decided_at == datetime(2021, 5, 2)
