"""Tests for repository deletion."""
from core.db_sqlite import get_repositories, delete_repository, get_db

def test_delete_repository_empty(tmp_path):
    res = delete_repository("nonexistent/repo", db_path=tmp_path / "test.db")
    assert res["deleted_decisions"] == 0
