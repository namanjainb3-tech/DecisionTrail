from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Literal
from core.db_sqlite import get_db

logger = logging.getLogger(__name__)

VerdictType = Literal["relevant", "not_relevant", "outdated"]


class FeedbackMemory(ABC):
    @abstractmethod
    def record(
        self,
        decision_id: str,
        path: str,
        verdict: VerdictType,
        note: str | None = None,
    ) -> None:
        """Records maintainer feedback on a decision surfaced for a file path."""
        pass

    @abstractmethod
    def adjustments(self, paths: list[str]) -> dict[str, float]:
        """Returns ranking score deltas keyed by decision_id for the given paths."""
        pass

    @abstractmethod
    def get_notes(self, paths: list[str]) -> dict[str, str]:
        """Returns annotation badges or notes keyed by decision_id."""
        pass


class SQLiteFeedbackMemory(FeedbackMemory):
    def __init__(self, db_path: Path | str | None = None) -> None:
        self.db_path = db_path
        self._init_table()

    def _init_table(self) -> None:
        conn = get_db(self.db_path)
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS feedback_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    decision_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    verdict TEXT NOT NULL,
                    note TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
        conn.close()

    def record(
        self,
        decision_id: str,
        path: str,
        verdict: VerdictType,
        note: str | None = None,
    ) -> None:
        conn = get_db(self.db_path)
        with conn:
            conn.execute(
                """
                INSERT INTO feedback_memory (decision_id, path, verdict, note, created_at)
                VALUES (?, ?, ?, ?, ?);
                """,
                (decision_id, path, verdict, note, datetime.now().isoformat()),
            )
        conn.close()

    def adjustments(self, paths: list[str]) -> dict[str, float]:
        if not paths:
            return {}
        conn = get_db(self.db_path)
        placeholders = ",".join("?" for _ in paths)
        cursor = conn.execute(
            f"""
            SELECT decision_id, verdict
            FROM feedback_memory
            WHERE path IN ({placeholders})
            ORDER BY id ASC;
            """,
            paths,
        )
        rows = cursor.fetchall()
        conn.close()

        score_deltas: dict[str, float] = {}
        for row in rows:
            dec_id = row["decision_id"]
            verdict = row["verdict"]
            if verdict == "relevant":
                score_deltas[dec_id] = score_deltas.get(dec_id, 0.0) + 0.5
            elif verdict == "not_relevant":
                score_deltas[dec_id] = score_deltas.get(dec_id, 0.0) - 1.0
            elif verdict == "outdated":
                # Severe suppression
                score_deltas[dec_id] = -999.0

        return score_deltas

    def get_notes(self, paths: list[str]) -> dict[str, str]:
        if not paths:
            return {}
        conn = get_db(self.db_path)
        placeholders = ",".join("?" for _ in paths)
        cursor = conn.execute(
            f"""
            SELECT decision_id, verdict, note
            FROM feedback_memory
            WHERE path IN ({placeholders})
            ORDER BY id DESC;
            """,
            paths,
        )
        rows = cursor.fetchall()
        conn.close()

        notes: dict[str, str] = {}
        for row in rows:
            dec_id = row["decision_id"]
            if dec_id in notes:
                continue
            verdict = row["verdict"]
            if verdict == "relevant":
                notes[dec_id] = "Previously marked relevant by a maintainer."
            elif verdict == "outdated":
                notes[dec_id] = f"Note: Marked outdated by maintainer ({row['note'] or 'no reason given'})."
        return notes


class Mem0FeedbackMemory(FeedbackMemory):
    """mem0 wrapper that delegates to SQLiteFeedbackMemory as fallback."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self.sqlite_fallback = SQLiteFeedbackMemory(db_path=db_path)
        self._mem0_client = None

        try:
            from mem0 import Memory
            self._mem0_client = Memory()
            logger.info("Initialized mem0 client successfully.")
        except Exception as e:
            logger.info(f"mem0 not configured or failed to initialize: {e}. Using SQLite feedback memory.")
            self._mem0_client = None

    def record(
        self,
        decision_id: str,
        path: str,
        verdict: VerdictType,
        note: str | None = None,
    ) -> None:
        self.sqlite_fallback.record(decision_id, path, verdict, note)
        if self._mem0_client:
            try:
                self._mem0_client.add(
                    f"Maintainer marked decision {decision_id} on path {path} as {verdict}. Note: {note or ''}",
                    user_id=f"path_{path}",
                )
            except Exception as e:
                logger.warning(f"mem0 add failed: {e}")

    def adjustments(self, paths: list[str]) -> dict[str, float]:
        return self.sqlite_fallback.adjustments(paths)

    def get_notes(self, paths: list[str]) -> dict[str, str]:
        return self.sqlite_fallback.get_notes(paths)


def get_feedback_memory(db_path: Path | str | None = None) -> FeedbackMemory:
    return Mem0FeedbackMemory(db_path=db_path)
