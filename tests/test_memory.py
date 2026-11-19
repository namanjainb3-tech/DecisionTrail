import json
from pathlib import Path
import pytest
from core.models import Decision
from bot.analyze import analyze_pr
from graph.code_linker import reset_rename_chains
from graph.loader import load_decisions, reset_mock_graph
from memory.feedback_memory import SQLiteFeedbackMemory

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def setup_seeded_graph():
    reset_mock_graph()
    reset_rename_chains()
    with open(FIXTURES_DIR / "sample_decisions.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    decisions = [Decision.model_validate(d) for d in data]
    load_decisions(decisions)
    yield
    reset_mock_graph()
    reset_rename_chains()


def test_feedback_memory_lifecycle_and_persistence(tmp_path: Path):
    db_file = tmp_path / "test_feedback.db"
    mem = SQLiteFeedbackMemory(db_path=db_file)

    # 1. Record feedback
    mem.record("dec_pathlib_001", "src/black/files.py", "not_relevant", "Too old")
    mem.record("dec_revert_unc_005", "src/black/files.py", "relevant", "Highly applicable")

    adjustments = mem.adjustments(["src/black/files.py"])
    assert adjustments["dec_pathlib_001"] == -1.0
    assert adjustments["dec_revert_unc_005"] == 0.5

    notes = mem.get_notes(["src/black/files.py"])
    assert "Previously marked relevant" in notes["dec_revert_unc_005"]

    # 2. Re-instantiate from the same database (process restart simulation)
    mem_reloaded = SQLiteFeedbackMemory(db_path=db_file)
    adj_reloaded = mem_reloaded.adjustments(["src/black/files.py"])
    assert adj_reloaded["dec_pathlib_001"] == -1.0
    assert adj_reloaded["dec_revert_unc_005"] == 0.5


def test_ranking_adjusts_after_maintainer_feedback(tmp_path: Path):
    db_file = tmp_path / "test_ranking_feedback.db"
    mem = SQLiteFeedbackMemory(db_path=db_file)

    # Pre-feedback analysis
    res1 = analyze_pr(
        repo="my-fork/black",
        changed_files=["src/black/files.py"],
        pr_title="Fix Windows path issue",
        feedback_memory=mem,
        threshold=0.2
    )
    score_before = {d["id"]: d["score"] for d in res1["decisions"]}
    assert "dec_pathlib_001" in score_before

    # Maintainer marks dec_pathlib_001 as not_relevant on this file path
    mem.record("dec_pathlib_001", "src/black/files.py", "not_relevant")

    # Re-analysis must rank it lower or drop it
    res2 = analyze_pr(
        repo="my-fork/black",
        changed_files=["src/black/files.py"],
        pr_title="Fix Windows path issue",
        feedback_memory=mem,
        threshold=0.2
    )
    score_after = {d["id"]: d["score"] for d in res2["decisions"]}

    if "dec_pathlib_001" in score_after:
        assert score_after["dec_pathlib_001"] < score_before["dec_pathlib_001"]


def test_outdated_feedback_suppresses_decision(tmp_path: Path):
    db_file = tmp_path / "test_outdated.db"
    mem = SQLiteFeedbackMemory(db_path=db_file)

    mem.record("dec_pathlib_001", "src/black/files.py", "outdated", "Superceded by PEP 518")

    res = analyze_pr(
        repo="my-fork/black",
        changed_files=["src/black/files.py"],
        pr_title="Fix Windows path issue",
        feedback_memory=mem,
        threshold=0.1
    )
    returned_ids = [d["id"] for d in res["decisions"]]
    assert "dec_pathlib_001" not in returned_ids

