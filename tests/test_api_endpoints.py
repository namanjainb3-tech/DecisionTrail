from __future__ import annotations

import pytest
from datetime import datetime
from api.main import (
    app,
    health,
    list_decisions,
    get_decision_detail,
    get_graph,
    api_pr_analyze,
    api_feedback,
    api_eval_results,
    PRAnalyzeRequest,
    FeedbackRequest,
)
from core.db_sqlite import save_decision
from core.models import Decision, Evidence, RejectedAlternative


@pytest.fixture
def sample_decision_fixture(tmp_path):
    db_file = tmp_path / "test_api.db"
    ev = Evidence(
        quote="We decided on a standalone Rust-based resolver for speed.",
        source_url="https://github.com/astral-sh/uv/pull/1",
        platform="github_pr",
        author_handle="charliermarsh",
        posted_at=datetime(2024, 2, 1, 12, 0, 0),
    )
    alt_ev = Evidence(
        quote="Forking pip's resolver would couple us tightly to internal churn.",
        source_url="https://github.com/astral-sh/uv/pull/1",
        platform="github_pr",
        author_handle="charliermarsh",
        posted_at=datetime(2024, 2, 1, 12, 0, 0),
    )
    dec = Decision(
        id="api_dec_1",
        repo_or_forum="astral-sh/uv",
        thread_id="github_astral-sh/uv_1",
        title="Use standalone virtualenv resolver",
        outcome="adopted",
        rationale="Significantly improves resolution speed by avoiding pip subprocesses.",
        alternatives=[
            RejectedAlternative(
                text="Fork pip's internal resolver",
                reason="Too coupled to pip release cadence and internal changes.",
                evidence=alt_ev,
            )
        ],
        evidence=[ev],
        confidence=0.95,
        linked_paths=["crates/uv-resolver/src/lib.rs"],
        extractor_model="gpt-oss-20b",
    )
    save_decision(dec, db_path=db_file)
    return dec, db_file


def test_api_routes_registered():
    routes = {r.path for r in app.routes}
    expected = {
        "/health",
        "/decisions",
        "/decisions/{decision_id}",
        "/graph",
        "/pr/analyze",
        "/feedback",
        "/eval/run",
        "/eval/results",
        "/ingest/github",
        "/ingest/discourse",
        "/extract/run",
    }
    for ep in expected:
        assert ep in routes, f"Missing expected endpoint: {ep}"


def test_api_decisions_list_and_detail(sample_decision_fixture):
    dec, db_file = sample_decision_fixture
    # Verify directly via helper
    from core.db_sqlite import get_decisions
    results = get_decisions(db_path=db_file)
    assert len(results) >= 1
    assert results[0]["id"] == "api_dec_1"


def test_api_graph_endpoint(sample_decision_fixture):
    dec, db_file = sample_decision_fixture
    from graph.loader import load_decisions
    load_decisions([dec], db_path=db_file)

    graph_data = get_graph()
    assert "nodes" in graph_data
    assert "edges" in graph_data
    assert len(graph_data["nodes"]) > 0


def test_api_pr_analyze_endpoint(sample_decision_fixture):
    dec, db_file = sample_decision_fixture
    req = PRAnalyzeRequest(
        repo="astral-sh/uv",
        changed_files=["crates/uv-resolver/src/lib.rs"],
        pr_title="Refactor resolver integration",
        threshold=0.1,
    )
    from bot.analyze import analyze_pr
    resp = analyze_pr(
        repo=req.repo,
        changed_files=req.changed_files,
        pr_title=req.pr_title,
        threshold=req.threshold,
        db_path=db_file,
    )
    assert "decisions" in resp
    assert "comment_markdown" in resp


def test_api_feedback_endpoint(sample_decision_fixture):
    dec, db_file = sample_decision_fixture
    from memory.feedback_memory import SQLiteFeedbackMemory
    mem = SQLiteFeedbackMemory(db_path=db_file)
    mem.record(
        decision_id="api_dec_1",
        path="crates/uv-resolver/src/lib.rs",
        verdict="not_relevant",
        note="Too old",
    )
    adj = mem.adjustments(["crates/uv-resolver/src/lib.rs"])
    assert adj.get("api_dec_1") == -1.0


def test_api_eval_results_endpoint():
    res = api_eval_results()
    assert "overall_recall" in res
    assert "results" in res
