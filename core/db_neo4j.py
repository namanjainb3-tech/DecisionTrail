from __future__ import annotations

import logging
from typing import Any
from neo4j import GraphDatabase, Driver
from core.config import settings

logger = logging.getLogger(__name__)

_driver: Driver | None = None
_neo4j_available: bool | None = None


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
    global _driver, _neo4j_available
    if _driver is not None:
        _driver.close()
        _driver = None
    _neo4j_available = None


def check_neo4j_connection(driver: Driver | None = None) -> bool:
    global _neo4j_available
    if _neo4j_available is False:
        return False
    try:
        d = driver or get_neo4j_driver()
        with d.session() as session:
            result = session.run("RETURN 1 AS test")
            _neo4j_available = result.single()["test"] == 1
            return _neo4j_available
    except Exception as e:
        logger.warning(f"Neo4j connection check failed: {e}")
        _neo4j_available = False
        return False


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
        session.run(
            """
            CREATE CONSTRAINT pr_id_unique IF NOT EXISTS
            FOR (pr:PR) REQUIRE pr.pr_number IS UNIQUE;
            """
        )

        # 384-dimensional cosine vector index on Decision.embedding
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
        logger.info("Neo4j constraints and vector index initialized successfully.")

