import json
from pathlib import Path
import pytest
from core.models import Decision
from bot.analyze import analyze_pr, check_repo_allowlist
from bot.render import render_bot_comment
from graph.code_linker import link_decisions_to_code, reset_rename_chains
from graph.loader import load_decisions, reset_mock_graph

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


def test_pr_touching_matching_file_surfaces_decision():
    result = analyze_pr(
        repo="my-fork/black",
        changed_files=["src/black/files.py"],
        pr_title="Fix Windows path slash normalization",
        post_to_github=False
    )
    decisions = result["decisions"]
    assert len(decisions) >= 1
    top_ids = [d["id"] for d in decisions]
    assert "dec_pathlib_001" in top_ids or "dec_revert_unc_005" in top_ids

    # Markdown comment must be generated
    comment = result["comment_markdown"]
    assert "## 🔍 DecisionTrail Context" in comment
    assert "Verify against the linked sources" in comment


def test_pr_touching_unrelated_file_returns_empty_and_no_comment():
    result = analyze_pr(
        repo="my-fork/black",
        changed_files=["docs/unrelated_documentation.md"],
        pr_title="Fix typo in docs",
        post_to_github=False,
        threshold=0.5
    )
    assert len(result["decisions"]) == 0
    assert result["comment_markdown"] == ""


def test_allowlist_blocks_unauthorized_posting(monkeypatch):
    monkeypatch.setattr("core.config.settings.ALLOWED_POST_REPOS", "my-fork/black")

    # Posting to allowed repo succeeds without PermissionError
    check_repo_allowlist("my-fork/black")

    # Posting to production upstream black repo must be strictly blocked!
    with pytest.raises(PermissionError) as exc_info:
        analyze_pr(
            repo="psf/black",
            changed_files=["src/black/files.py"],
            pr_title="Update paths",
            post_to_github=True
        )
    assert "Security Violation" in str(exc_info.value)

