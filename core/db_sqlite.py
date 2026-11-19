from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any
from core.config import settings
from core.models import Comment, Decision, Document


def get_db(db_path: Path | str | None = None) -> sqlite3.Connection:
    if db_path is None:
        db_path = settings.SQLITE_DB_PATH
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    # Ensure tables exist
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='decisions';")
    if not cursor.fetchone():
        _create_tables(conn)
    return conn


def _create_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS documents (
            thread_id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            raw_json TEXT
        );

        CREATE TABLE IF NOT EXISTS comments (
            comment_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            author_handle TEXT NOT NULL,
            author_email TEXT,
            posted_at TEXT NOT NULL,
            body TEXT NOT NULL,
            url TEXT NOT NULL,
            platform TEXT,
            FOREIGN KEY (thread_id) REFERENCES documents (thread_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chunks (
            chunk_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            comment_ids TEXT NOT NULL,
            text TEXT NOT NULL,
            cue_matched INTEGER DEFAULT 0,
            FOREIGN KEY (thread_id) REFERENCES documents (thread_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            handle TEXT NOT NULL,
            email_hash TEXT,
            canonical_person_id TEXT NOT NULL,
            UNIQUE(platform, handle)
        );

        CREATE TABLE IF NOT EXISTS ingest_cursors (
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            last_updated_at TEXT NOT NULL,
            PRIMARY KEY (source_type, source_id)
        );

        CREATE TABLE IF NOT EXISTS decisions (
            id TEXT PRIMARY KEY,
            repo_or_forum TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            title TEXT NOT NULL,
            outcome TEXT NOT NULL,
            rationale TEXT NOT NULL,
            alternatives TEXT NOT NULL, -- JSON
            evidence TEXT NOT NULL,     -- JSON
            confidence REAL NOT NULL,
            decided_at TEXT,
            linked_paths TEXT,          -- JSON
            extractor_model TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eval_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pep_number INTEGER NOT NULL,
            ground_truth_count INTEGER NOT NULL,
            predicted_count INTEGER NOT NULL,
            matched_count INTEGER NOT NULL,
            recall REAL NOT NULL,
            precision REAL NOT NULL,
            details TEXT,               -- JSON
            run_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(
            comment_id UNINDEXED,
            body,
            tokenize = 'porter unicode61'
        );
        """
    )


def init_db(db_path: Path | str | None = None) -> None:
    conn = get_db(db_path)
    conn.close()


def upsert_document(doc: Document, db_path: Path | str | None = None) -> None:
    conn = get_db(db_path)
    with conn:
        conn.execute(
            """
            INSERT INTO documents (thread_id, platform, url, title, created_at, raw_json)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(thread_id) DO UPDATE SET
                url = excluded.url,
                title = excluded.title,
                created_at = excluded.created_at;
            """,
            (
                doc.thread_id,
                doc.platform,
                doc.url,
                doc.title,
                doc.created_at.isoformat(),
                doc.model_dump_json(),
            ),
        )
        for comment in doc.comments:
            conn.execute(
                """
                INSERT INTO comments (comment_id, thread_id, author_handle, author_email, posted_at, body, url, platform)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(comment_id) DO UPDATE SET
                    author_handle = excluded.author_handle,
                    author_email = excluded.author_email,
                    posted_at = excluded.posted_at,
                    body = excluded.body,
                    url = excluded.url;
                """,
                (
                    comment.comment_id,
                    doc.thread_id,
                    comment.author_handle,
                    comment.author_email,
                    comment.posted_at.isoformat(),
                    comment.body,
                    comment.url,
                    doc.platform,
                ),
            )
            # Maintain FTS index
            conn.execute("DELETE FROM comments_fts WHERE comment_id = ?", (comment.comment_id,))
            conn.execute(
                "INSERT INTO comments_fts (comment_id, body) VALUES (?, ?)",
                (comment.comment_id, comment.body),
            )
    conn.close()


def save_decision(decision: Decision, db_path: Path | str | None = None) -> None:
    conn = get_db(db_path)
    with conn:
        conn.execute(
            """
            INSERT INTO decisions (
                id, repo_or_forum, thread_id, title, outcome, rationale,
                alternatives, evidence, confidence, decided_at, linked_paths, extractor_model
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                outcome = excluded.outcome,
                rationale = excluded.rationale,
                alternatives = excluded.alternatives,
                evidence = excluded.evidence,
                confidence = excluded.confidence,
                decided_at = excluded.decided_at,
                linked_paths = excluded.linked_paths,
                extractor_model = excluded.extractor_model;
            """,
            (
                decision.id,
                decision.repo_or_forum,
                decision.thread_id,
                decision.title,
                decision.outcome,
                decision.rationale,
                json.dumps([a.model_dump(mode="json") for a in decision.alternatives]),
                json.dumps([e.model_dump(mode="json") for e in decision.evidence]),
                decision.confidence,
                decision.decided_at.isoformat() if decision.decided_at else None,
                json.dumps(decision.linked_paths),
                decision.extractor_model,
            ),
        )
    conn.close()


def get_decisions(
    q: str | None = None,
    path: str | None = None,
    outcome: str | None = None,
    repo: str | None = None,
    limit: int = 50,
    db_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    conn = get_db(db_path)
    clauses = []
    params: list[Any] = []

    if outcome:
        clauses.append("outcome = ?")
        params.append(outcome)

    if repo and repo.lower() != "all":
        clauses.append("(repo_or_forum = ? OR repo_or_forum LIKE ?)")
        params.extend([repo, f"%{repo}%"])

    if q:
        clauses.append("(title LIKE ? OR rationale LIKE ? OR thread_id LIKE ? OR id LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])

    if path:
        clauses.append("linked_paths LIKE ?")
        params.append(f"%{path}%")

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM decisions {where_sql} ORDER BY rowid DESC LIMIT ?"
    params.append(limit)

    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for row in rows:
        d = dict(row)
        d["alternatives"] = json.loads(d["alternatives"])
        d["evidence"] = json.loads(d["evidence"])
        d["linked_paths"] = json.loads(d["linked_paths"]) if d["linked_paths"] else []
        result.append(d)
    return result


def get_discussions_summary(
    repo: str | None = None,
    q: str | None = None,
    limit: int = 50,
    db_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    conn = get_db(db_path)
    clauses = []
    params: list[Any] = []

    if repo and repo.lower() != "all":
        clauses.append("(d.thread_id LIKE ? OR d.url LIKE ?)")
        params.extend([f"%{repo}%", f"%{repo}%"])

    if q and q.strip():
        term = f"%{q.strip()}%"
        clauses.append("(d.title LIKE ? OR d.thread_id LIKE ? OR d.url LIKE ?)")
        params.extend([term, term, term])

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"""
        SELECT 
            d.thread_id,
            d.platform,
            d.url,
            d.title,
            d.created_at,
            COUNT(c.comment_id) as comment_count
        FROM documents d
        LEFT JOIN comments c ON d.thread_id = c.thread_id
        {where_sql}
        GROUP BY d.thread_id
        ORDER BY d.rowid DESC
        LIMIT ?
    """
    params.append(limit)

    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append({
            "thread_id": r["thread_id"],
            "platform": r["platform"],
            "url": r["url"],
            "title": r["title"],
            "created_at": r["created_at"],
            "comment_count": r["comment_count"],
        })
    return result


def get_discussion_detail(
    thread_id: str,
    db_path: Path | str | None = None,
) -> dict[str, Any] | None:
    conn = get_db(db_path)
    cursor = conn.execute("SELECT * FROM documents WHERE thread_id = ?", (thread_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    doc = dict(row)
    c_cursor = conn.execute(
        "SELECT * FROM comments WHERE thread_id = ? ORDER BY posted_at ASC", (thread_id,)
    )
    comments = [dict(c) for c in c_cursor.fetchall()]
    conn.close()

    doc["comments"] = comments
    return doc


def get_repositories(db_path: Path | str | None = None) -> list[str]:
    conn = get_db(db_path)
    repos: set[str] = set()

    # 1. Repositories with decisions
    cursor = conn.execute(
        "SELECT DISTINCT repo_or_forum FROM decisions WHERE repo_or_forum IS NOT NULL AND repo_or_forum != ''"
    )
    for r in cursor.fetchall():
        if r[0]:
            repos.add(r[0].strip())

    # 2. Repositories with ingested cursors
    try:
        cursor = conn.execute(
            "SELECT DISTINCT source_id FROM ingest_cursors WHERE source_type = 'github' AND source_id IS NOT NULL AND source_id != ''"
        )
        for r in cursor.fetchall():
            if r[0]:
                repos.add(r[0].strip())
    except Exception:
        pass

    # 3. Repositories from documents thread_id
    try:
        cursor = conn.execute(
            "SELECT DISTINCT thread_id FROM documents WHERE thread_id LIKE 'github_%'"
        )
        for r in cursor.fetchall():
            if r[0]:
                raw = r[0].removeprefix("github_")
                if "_" in raw:
                    repo_name = raw.rsplit("_", 1)[0]
                    if repo_name:
                        repos.add(repo_name.strip())
    except Exception:
        pass

    conn.close()
    return sorted(list(repos))



# Repository deletion cascade logic to be added in next commit
