import json
from pathlib import Path
import pytest
from core.models import Decision
from graph.loader import (
    get_decision,
    get_mock_graph_state,
    get_neighborhood,
    load_decisions,
    rebuild_from_sqlite,
    reset_mock_graph,
    search_vector,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def clean_graph():
    reset_mock_graph()
    yield
    reset_mock_graph()


def load_fixture_decisions() -> list[Decision]:
    with open(FIXTURES_DIR / "sample_decisions.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return [Decision.model_validate(d) for d in data]


def test_graph_loading_idempotency():
    decisions = load_fixture_decisions()
    assert len(decisions) == 5

    # Run 1
    load_decisions(decisions)
    state_1 = get_mock_graph_state()
    node_count_1 = len(state_1["nodes"])
    edge_count_1 = len(state_1["edges"])

    assert node_count_1 > 0
    assert edge_count_1 > 0

    # Run 2: Idempotent upsert
    load_decisions(decisions)
    state_2 = get_mock_graph_state()
    node_count_2 = len(state_2["nodes"])
    # Edges should not blow up duplicate sets or nodes
    assert node_count_2 == node_count_1


def test_get_decision_returns_alternatives_and_sources():
    decisions = load_fixture_decisions()
    load_decisions(decisions)

    d = get_decision("dec_pathlib_001")
    assert d is not None
    assert d["title"] == "Use pathlib instead of os.path"
    assert d["outcome"] == "adopted"

    # Check alternatives
    assert len(d["alternatives"]) == 1
    assert "Keep os.path" in d["alternatives"][0]["text"]
    assert "UNC paths" in d["alternatives"][0]["reason"]

    # Check evidence / sources
    assert len(d["evidence"]) >= 1
    assert any("github.com/psf/black/issues/101" in s["url"] for s in d["evidence"])

    # Check files
    assert "src/black/files.py" in d["files"]


def test_get_neighborhood_graph_traversal():
    decisions = load_fixture_decisions()
    load_decisions(decisions)

    neighborhood = get_neighborhood("dec_pattern_match_003", depth=2)
    assert len(neighborhood["nodes"]) >= 3
    node_types = {n.get("type") for n in neighborhood["nodes"]}
    assert "Decision" in node_types
    assert "Alternative" in node_types or "Source" in node_types


def test_vector_search_returns_expected_decision_on_paraphrase():
    decisions = load_fixture_decisions()
    load_decisions(decisions)

    # Paraphrased query about path slashes on Windows
    results = search_vector("fixing Windows slash and path traversal issues", top_k=3)
    assert len(results) > 0
    top_ids = [r["id"] for r in results]

    # Either the pathlib decision or the revert UNC decision should rank top
    assert "dec_pathlib_001" in top_ids or "dec_revert_unc_005" in top_ids


def test_rebuild_from_sqlite(tmp_path: Path):
    from core.db_sqlite import init_db, save_decision
    db_file = tmp_path / "test_rebuild.db"
    init_db(db_file)

    decisions = load_fixture_decisions()
    for d in decisions:
        save_decision(d, db_path=db_file)

    loaded_count = rebuild_from_sqlite(db_path=db_file)
    assert loaded_count == 5

    d = get_decision("dec_line_length_004")
    assert d is not None
    assert d["title"] == "Default line length 88 characters"
