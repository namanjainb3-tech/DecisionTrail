import json
from datetime import datetime
from pathlib import Path
import pytest
import httpx
from api.main import app
from core.db_sqlite import init_db, upsert_document, search_comments_bm25, save_decision, get_decisions
from core.models import Comment, Decision, Document, Evidence
from core.llm import complete_json, get_cache_path


def test_api_health():
    routes = {r.path: r for r in app.routes}
    assert "/health" in routes
    assert "GET" in routes["/health"].methods
    from api.main import health
    resp = health()
    assert resp == {"status": "ok"}


def test_sqlite_document_and_fts(tmp_path: Path):
    db_file = tmp_path / "test.db"
    init_db(db_file)

    c = Comment(
        comment_id="comm_100",
        author_handle="ambv",
        author_email="ambv@example.com",
        posted_at=datetime.now(),
        body="We decided against supporting Python 2.7 in Black formatting.",
        url="https://github.com/psf/black/issues/100#1"
    )
    doc = Document(
        thread_id="thread_100",
        platform="github_issue",
        url="https://github.com/psf/black/issues/100",
        title="Drop Python 2 support",
        created_at=datetime.now(),
        comments=[c]
    )

    upsert_document(doc, db_file)

    # Search with BM25 FTS5
    results = search_comments_bm25("formatting", db_path=db_file)
    assert len(results) >= 1
    assert results[0]["comment_id"] == "comm_100"


def test_sqlite_save_and_get_decision(tmp_path: Path):
    db_file = tmp_path / "test.db"
    init_db(db_file)

    ev = Evidence(
        source_url="https://github.com/psf/black/issues/100#1",
        platform="github_issue",
        author_handle="ambv",
        posted_at=datetime.now(),
        quote="We decided against supporting Python 2.7 in Black formatting."
    )
    decision = Decision(
        id="dec_drop_py2",
        repo_or_forum="psf/black",
        thread_id="thread_100",
        title="Drop Python 2 support",
        outcome="adopted",
        rationale="Python 2 is EOL",
        alternatives=[],
        evidence=[ev],
        confidence=1.0,
        decided_at=datetime.now(),
        linked_paths=["src/black/__init__.py"],
        extractor_model="gpt-oss-20b"
    )
    save_decision(decision, db_file)

    retrieved = get_decisions(q="Python 2", db_path=db_file)
    assert len(retrieved) == 1
    assert retrieved[0]["id"] == "dec_drop_py2"
    assert retrieved[0]["outcome"] == "adopted"
    assert retrieved[0]["evidence"][0]["author_handle"] == "ambv"


def test_llm_cache_serving(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("core.config.settings.RAW_DATA_DIR", tmp_path)
    prompt = "What is 2 + 2?"
    schema = {"type": "object", "properties": {"result": {"type": "integer"}}}
    system_prompt = "Math helper"

    cache_file = get_cache_path(prompt, json.dumps(schema, sort_keys=True), system_prompt)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump({"result": 4}, f)

    # Should serve directly from disk cache without calling external API
    result = complete_json(prompt, schema=schema, system_prompt=system_prompt)
    assert result == {"result": 4}
