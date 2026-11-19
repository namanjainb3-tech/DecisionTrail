from __future__ import annotations

import logging
import time
from typing import Any
from neo4j import GraphDatabase, Driver
from core.config import settings

logger = logging.getLogger(__name__)

_driver: Driver | None = None
_neo4j_available: bool | None = None
_last_error: str | None = None
_last_check_timestamp: float = 0.0
_has_logged_offline: bool = False
RECHECK_INTERVAL_SEC: float = 60.0  # Cooldown between socket probe attempts


def get_neo4j_driver(
    uri: str | None = None,
    user: str | None = None,
    password: str | None = None,
) -> Driver:
    global _driver
    if _driver is None:
        uri = uri or settings.NEO4J_URI
        user = user or settings.NEO4J_USER
        password = password or settings.NEO4J_PASSWORD
        _driver = GraphDatabase.driver(uri, auth=(user, password))
    return _driver


def close_neo4j_driver() -> None:
    global _driver, _neo4j_available, _last_error, _last_check_timestamp, _has_logged_offline
    if _driver is not None:
        try:
            _driver.close()
        except Exception:
            pass
        _driver = None
    _neo4j_available = None
    _last_error = None
    _last_check_timestamp = 0.0
    _has_logged_offline = False


def check_neo4j_connection(driver: Driver | None = None, force_recheck: bool = False) -> bool:
    global _neo4j_available, _last_error, _last_check_timestamp, _has_logged_offline

    now = time.time()
    # If checked recently and not forcing a recheck, return cached status
    if not force_recheck and _neo4j_available is not None:
        if not _neo4j_available and (now - _last_check_timestamp) < RECHECK_INTERVAL_SEC:
            return False
        if _neo4j_available:
            return True

    _last_check_timestamp = now
    try:
        d = driver or get_neo4j_driver()
        with d.session() as session:
            result = session.run("RETURN 1 AS test")
            record = result.single()
            _neo4j_available = bool(record and record["test"] == 1)
            if _neo4j_available:
                _last_error = None
                logger.info(f"Connected to Neo4j database at {settings.NEO4J_URI}")
            return _neo4j_available
    except Exception as e:
        _last_error = str(e)
        logger.debug(f"Neo4j connection check failed: {e}")
        if not _has_logged_offline:
            logger.info("Neo4j offline. Using built-in high-fidelity graph store.")
            _has_logged_offline = True
        _neo4j_available = False
        return False


def get_neo4j_status(driver: Driver | None = None, force: bool = False) -> dict[str, Any]:
    """Returns detailed diagnostics of the Neo4j connection."""
    is_live = check_neo4j_connection(driver=driver, force_recheck=force)
    return {
        "is_live": is_live,
        "uri": settings.NEO4J_URI,
        "engine": "Neo4j 5.x Graph Database" if is_live else "Built-in High-Fidelity Graph Store (Offline Fallback)",
        "last_error": _last_error if not is_live else None,
        "mode": "live_neo4j" if is_live else "in_memory_fallback",
        "instructions": (
            "Connected to live Neo4j instance."
            if is_live
            else "Neo4j offline. DecisionTrail is using its built-in in-memory graph store. "
            "To connect real Neo4j, start Docker ('docker compose up -d') or point NEO4J_URI in .env "
            "to a free Neo4j Aura cloud instance (https://console.neo4j.io)."
        ),
    }


def init_neo4j_schema(driver: Driver | None = None) -> None:
    """Creates unique constraints and vector index in Neo4j."""
    d = driver or get_neo4j_driver()
    with d.session() as session:
        # Unique constraints
        session.run(
            """
            CREATE CONSTRAINT decision_id_unique IF NOT EXISTS
            FOR (d:Decision) REQUIRE d.id IS UNIQUE;
            """
        )
        session.run(
            """
            CREATE CONSTRAINT source_url_unique IF NOT EXISTS
            FOR (s:Source) REQUIRE s.url IS UNIQUE;
            """
        )
        session.run(
            """
            CREATE CONSTRAINT file_id_unique IF NOT EXISTS
            FOR (f:File) REQUIRE f.file_id IS UNIQUE;
            """
        )
        session.run(
            """
            CREATE CONSTRAINT person_id_unique IF NOT EXISTS
            FOR (p:Person) REQUIRE p.id IS UNIQUE;
            """
        )

        # Vector index for decision semantic similarity
        session.run(
            """
            CREATE VECTOR INDEX decision_embedding_idx IF NOT EXISTS
            FOR (d:Decision) ON (d.embedding)
            OPTIONS {indexConfig: {
                `vector.dimensions`: 384,
                `vector.similarity_function`: 'cosine'
            }};
            """
        )
