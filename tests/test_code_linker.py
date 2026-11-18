from datetime import datetime
import pytest
from core.models import Comment, Decision, Evidence
from graph.code_linker import (
    find_decisions_for_path,
    is_revert_pr,
    link_decisions_to_code,
    record_file_rename,
    reset_rename_chains,
    resolve_ancestor_paths,
)
from graph.loader import reset_mock_graph


@pytest.fixture(autouse=True)
def clean_graph():
    reset_mock_graph()
    reset_rename_chains()
    yield
    reset_mock_graph()
    reset_rename_chains()


def test_rename_chain_resolution():
    # Synthetic history: a.py -> b.py -> c.py
    record_file_rename("src/a.py", "src/b.py")
    record_file_rename("src/b.py", "src/c.py")

    ancestors = resolve_ancestor_paths("src/c.py")
    assert "src/c.py" in ancestors
    assert "src/b.py" in ancestors
    assert "src/a.py" in ancestors


def test_decision_linked_to_old_file_surfaces_on_new_file():
    ev = Evidence(
        source_url="https://github.com/psf/black/pull/101#1",
        platform="github_pr",
        author_handle="ambv",
        posted_at=datetime.now(),
        quote="Adopted pathlib"
    )
    d = Decision(
        id="dec_path_101",
        repo_or_forum="psf/black",
        thread_id="github_psf/black_101",
        title="Pathlib refactoring",
        outcome="adopted",
        rationale="Better path handling",
        alternatives=[],
        evidence=[ev],
        confidence=1.0,
        decided_at=datetime.now(),
        linked_paths=[],
        extractor_model="gpt-oss-20b"
    )

    # PR 101 modified a.py and renamed it to b.py
    pr_files_map = {
        "101": [
            {"filename": "src/black/b.py", "previous_filename": "src/black/a.py", "status": "renamed"}
        ]
    }

    link_decisions_to_code([d], pr_files_map)
    assert "src/black/b.py" in d.linked_paths

    # Later, someone renames b.py to c.py
    record_file_rename("src/black/b.py", "src/black/c.py")

    # Querying the newest path c.py must surface the decision from a.py / b.py!
    matched = find_decisions_for_path("src/black/c.py")
    assert len(matched) == 1
    assert matched[0]["id"] == "dec_path_101"


def test_revert_pr_flips_outcome():
    ev = Evidence(
        source_url="https://github.com/psf/black/pull/200#1",
        platform="github_pr",
        author_handle="ambv",
        posted_at=datetime.now(),
        quote="Reverted because it broke Windows paths"
    )
    d = Decision(
        id="dec_revert_200",
        repo_or_forum="psf/black",
        thread_id="github_psf/black_200",
        title="Revert 'Use custom regex separator normalization'",
        outcome="adopted",  # Originally adopted before revert
        rationale="Fix regression",
        alternatives=[],
        evidence=[ev],
        confidence=1.0,
        decided_at=datetime.now(),
        linked_paths=[],
        extractor_model="gpt-oss-20b"
    )

    pr_files_map = {
        "200": [{"filename": "src/black/files.py"}]
    }

    assert is_revert_pr(d.title) is True
    link_decisions_to_code([d], pr_files_map)

    # Outcome must be flipped to reverted
    assert d.outcome == "reverted"


def test_decision_without_pr_gets_zero_affects_edges():
    ev = Evidence(
        source_url="https://discuss.python.org/t/4700/1",
        platform="discourse",
        author_handle="gvanrossum",
        posted_at=datetime.now(),
        quote="Discussion on general syntax"
    )
    d = Decision(
        id="dec_pure_discussion",
        repo_or_forum="discourse",
        thread_id="discourse_4700",
        title="General discussion on PEP",
        outcome="deferred",
        rationale="No implementation yet",
        alternatives=[],
        evidence=[ev],
        confidence=0.8,
        decided_at=datetime.now(),
        linked_paths=[],
        extractor_model="gpt-oss-20b"
    )

    # Empty pr_files_map (no code PR associated)
    link_decisions_to_code([d], pr_files_map={})
    assert len(d.linked_paths) == 0

    matched = find_decisions_for_path("src/any/file.py")
    assert len(matched) == 0
