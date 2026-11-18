from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from core.db_neo4j import check_neo4j_connection, get_neo4j_driver, init_neo4j_schema
from core.db_sqlite import get_db, get_decisions
from core.models import Decision
from retrieve.embeddings import cosine_similarity, embed_decision, embed_text

logger = logging.getLogger(__name__)

# Fallback graph storage when Neo4j is not connected
_mock_graph: dict[str, Any] = {
    "nodes": {},  # id -> {type, props}
    "edges": [],  # list of {source, target, type, props}
    "embeddings": {},  # decision_id -> embedding list
}


def reset_mock_graph() -> None:
    _mock_graph["nodes"].clear()
    _mock_graph["edges"].clear()
    _mock_graph["embeddings"].clear()


def get_mock_graph_state() -> dict[str, Any]:
    return _mock_graph


def load_decisions(
    decisions: list[Decision],
    driver: Any = None,
    db_path: Path | str | None = None,
) -> None:
    """Upserts decisions, alternatives, sources, persons, aliases, and file edges into the graph."""
    is_live = False
    try:
        d = driver or get_neo4j_driver()
        is_live = check_neo4j_connection(d)
    except Exception:
        is_live = False

    if is_live:
        _load_decisions_neo4j(decisions, driver=d, db_path=db_path)
    else:
        logger.info("Neo4j offline. Loading into fallback graph store.")
        _load_decisions_mock(decisions, db_path=db_path)


def _load_decisions_neo4j(
    decisions: list[Decision],
    driver: Any,
    db_path: Path | str | None = None,
) -> None:
    init_neo4j_schema(driver)

    with driver.session() as session:
        for dec in decisions:
            embedding = embed_decision(dec)
            decided_at_str = dec.decided_at.isoformat() if dec.decided_at else None

            # Upsert Decision Node
            session.run(
                """
                MERGE (d:Decision {id: $id})
                SET d.title = $title,
                    d.outcome = $outcome,
                    d.rationale = $rationale,
                    d.confidence = $confidence,
                    d.decided_at = $decided_at,
                    d.repo_or_forum = $repo_or_forum,
                    d.embedding = $embedding
                """,
                {
                    "id": dec.id,
                    "title": dec.title,
                    "outcome": dec.outcome,
                    "rationale": dec.rationale,
                    "confidence": dec.confidence,
                    "decided_at": decided_at_str,
                    "repo_or_forum": dec.repo_or_forum,
                    "embedding": embedding,
                },
            )

            # Upsert Evidence & Sources
            for ev in dec.evidence:
                session.run(
                    """
                    MATCH (d:Decision {id: $dec_id})
                    MERGE (s:Source {url: $url})
                    SET s.quote = $quote,
                        s.platform = $platform,
                        s.posted_at = $posted_at,
                        s.author_handle = $author
                    MERGE (d)-[:SUPPORTED_BY]->(s)
                    MERGE (p:Person {id: $person_id})
                    MERGE (p)-[:AUTHORED]->(s)
                    MERGE (al:Alias {platform: $platform, handle: $author})
                    MERGE (al)-[:ALIAS_OF]->(p)
                    """,
                    {
                        "dec_id": dec.id,
                        "url": ev.source_url,
                        "quote": ev.quote,
                        "platform": ev.platform,
                        "posted_at": ev.posted_at.isoformat(),
                        "author": ev.author_handle,
                        "person_id": f"person_{ev.author_handle.lower()}",
                    },
                )

            # Upsert Alternatives
            for idx, alt in enumerate(dec.alternatives):
                alt_id = f"{dec.id}_alt_{idx}"
                session.run(
                    """
                    MATCH (d:Decision {id: $dec_id})
                    MERGE (a:Alternative {id: $alt_id})
                    SET a.text = $text, a.reason = $reason
                    MERGE (d)-[:HAS_ALTERNATIVE]->(a)
                    MERGE (s:Source {url: $url})
                    SET s.quote = $quote,
                        s.platform = $platform,
                        s.posted_at = $posted_at,
                        s.author_handle = $author
                    MERGE (a)-[:SUPPORTED_BY]->(s)
                    """,
                    {
                        "dec_id": dec.id,
                        "alt_id": alt_id,
                        "text": alt.text,
                        "reason": alt.reason,
                        "url": alt.evidence.source_url,
                        "quote": alt.evidence.quote,
                        "platform": alt.evidence.platform,
                        "posted_at": alt.evidence.posted_at.isoformat(),
                        "author": alt.evidence.author_handle,
                    },
                )

            # Upsert Linked Files
            for path in dec.linked_paths:
                session.run(
                    """
                    MATCH (d:Decision {id: $dec_id})
                    MERGE (f:File {file_id: $path})
                    SET f.path = $path
                    MERGE (d)-[:AFFECTS]->(f)
                    """,
                    {"dec_id": dec.id, "path": path},
                )


def _load_decisions_mock(
    decisions: list[Decision],
    db_path: Path | str | None = None,
) -> None:
    nodes = _mock_graph["nodes"]
    edges = _mock_graph["edges"]
    embeddings = _mock_graph["embeddings"]

    for dec in decisions:
        embedding = embed_decision(dec)
        embeddings[dec.id] = embedding

        # Decision node
        nodes[dec.id] = {
            "id": dec.id,
            "type": "Decision",
            "title": dec.title,
            "outcome": dec.outcome,
            "rationale": dec.rationale,
            "confidence": dec.confidence,
            "decided_at": dec.decided_at.isoformat() if dec.decided_at else None,
            "repo_or_forum": dec.repo_or_forum,
        }

        # Evidence nodes
        for ev in dec.evidence:
            source_id = ev.source_url
            nodes[source_id] = {
                "id": source_id,
                "type": "Source",
                "url": ev.source_url,
                "quote": ev.quote,
                "platform": ev.platform,
                "author": ev.author_handle,
                "posted_at": ev.posted_at.isoformat(),
            }
            edges.append({"source": dec.id, "target": source_id, "type": "SUPPORTED_BY"})

            person_id = f"person_{ev.author_handle.lower()}"
            nodes[person_id] = {"id": person_id, "type": "Person", "handle": ev.author_handle}
            edges.append({"source": person_id, "target": source_id, "type": "AUTHORED"})

        # Alternative nodes
        for idx, alt in enumerate(dec.alternatives):
            alt_id = f"{dec.id}_alt_{idx}"
            nodes[alt_id] = {
                "id": alt_id,
                "type": "Alternative",
                "text": alt.text,
                "reason": alt.reason,
            }
            edges.append({"source": dec.id, "target": alt_id, "type": "HAS_ALTERNATIVE"})

            alt_source_id = alt.evidence.source_url
            nodes[alt_source_id] = {
                "id": alt_source_id,
                "type": "Source",
                "url": alt.evidence.source_url,
                "quote": alt.evidence.quote,
                "platform": alt.evidence.platform,
                "author": alt.evidence.author_handle,
            }
            edges.append({"source": alt_id, "target": alt_source_id, "type": "SUPPORTED_BY"})

        # File nodes
        for path in dec.linked_paths:
            file_id = f"file_{path}"
            nodes[file_id] = {"id": file_id, "type": "File", "path": path}
            edges.append({"source": dec.id, "target": file_id, "type": "AFFECTS"})


def get_decision(decision_id: str, driver: Any = None) -> dict[str, Any] | None:
    is_live = False
    try:
        d = driver or get_neo4j_driver()
        is_live = check_neo4j_connection(d)
    except Exception:
        is_live = False

    if is_live:
        with d.session() as session:
            result = session.run(
                """
                MATCH (d:Decision {id: $id})
                OPTIONAL MATCH (d)-[:HAS_ALTERNATIVE]->(a:Alternative)-[:SUPPORTED_BY]->(as:Source)
                OPTIONAL MATCH (d)-[:SUPPORTED_BY]->(s:Source)
                OPTIONAL MATCH (d)-[:AFFECTS]->(f:File)
                RETURN d, collect(DISTINCT a) as alts, collect(DISTINCT s) as sources, collect(DISTINCT f) as files
                """,
                {"id": decision_id},
            )
            record = result.single()
            if not record or not record["d"]:
                return None
            d_node = dict(record["d"])
            d_node["alternatives"] = [dict(a) for a in record["alts"]]
            d_node["evidence"] = [dict(s) for s in record["sources"]]
            d_node["files"] = [f["path"] for f in record["files"]]
            return d_node

    # Fallback to mock graph
    nodes = _mock_graph["nodes"]
    edges = _mock_graph["edges"]
    if decision_id not in nodes:
        return None

    dec = dict(nodes[decision_id])
    alts = []
    sources = []
    files = []

    for edge in edges:
        if edge["source"] == decision_id and edge["type"] == "HAS_ALTERNATIVE":
            alt_node = nodes.get(edge["target"])
            if alt_node:
                alts.append(alt_node)
        elif edge["source"] == decision_id and edge["type"] == "SUPPORTED_BY":
            source_node = nodes.get(edge["target"])
            if source_node:
                sources.append(source_node)
        elif edge["source"] == decision_id and edge["type"] == "AFFECTS":
            file_node = nodes.get(edge["target"])
            if file_node:
                files.append(file_node.get("path"))

    dec["alternatives"] = alts
    dec["evidence"] = sources
    dec["files"] = files
    return dec


def get_neighborhood(node_id: str, depth: int = 2, driver: Any = None) -> dict[str, list[dict]]:
    """Returns nodes and edges within `depth` steps from `node_id`."""
    is_live = False
    try:
        d = driver or get_neo4j_driver()
        is_live = check_neo4j_connection(d)
    except Exception:
        is_live = False

    if is_live:
        with d.session() as session:
            result = session.run(
                f"""
                MATCH (start {{id: $node_id}})
                CALL apoc.path.subgraphAll(start, {{maxLevel: {depth}}})
                YIELD nodes, relationships
                RETURN nodes, relationships
                """,
                {"node_id": node_id},
            )
            record = result.single()
            if not record:
                return {"nodes": [], "edges": []}
            return {
                "nodes": [dict(n) for n in record["nodes"]],
                "edges": [
                    {
                        "source": r.start_node["id"],
                        "target": r.end_node["id"],
                        "type": r.type,
                    }
                    for r in record["relationships"]
                ],
            }

    # Mock neighborhood traversal
    visited_nodes: set[str] = set()
    collected_edges: list[dict] = []
    current_layer = {node_id}

    for _ in range(depth):
        next_layer = set()
        for nid in current_layer:
            if nid in _mock_graph["nodes"]:
                visited_nodes.add(nid)
            for e in _mock_graph["edges"]:
                if e["source"] == nid and e["target"] not in visited_nodes:
                    collected_edges.append(e)
                    next_layer.add(e["target"])
                elif e["target"] == nid and e["source"] not in visited_nodes:
                    collected_edges.append(e)
                    next_layer.add(e["source"])
        current_layer = next_layer

    for nid in current_layer:
        if nid in _mock_graph["nodes"]:
            visited_nodes.add(nid)

    return {
        "nodes": [_mock_graph["nodes"][nid] for nid in visited_nodes if nid in _mock_graph["nodes"]],
        "edges": collected_edges,
    }


def search_vector(query: str, top_k: int = 5, driver: Any = None) -> list[dict[str, Any]]:
    """Finds decisions most semantically similar to `query`."""
    query_vec = embed_text(query)

    is_live = False
    try:
        d = driver or get_neo4j_driver()
        is_live = check_neo4j_connection(d)
    except Exception:
        is_live = False

    if is_live:
        with d.session() as session:
            result = session.run(
                """
                CALL db.index.vector.queryNodes('decision_embedding_idx', $top_k, $query_vec)
                YIELD node, score
                RETURN node, score
                """,
                {"top_k": top_k, "query_vec": query_vec},
            )
            matches = []
            for record in result:
                item = dict(record["node"])
                item["score"] = float(record["score"])
                matches.append(item)
            return matches

    # Mock cosine search over memory embeddings
    scored = []
    for dec_id, vec in _mock_graph["embeddings"].items():
        score = cosine_similarity(query_vec, vec)
        node = _mock_graph["nodes"].get(dec_id, {})
        entry = dict(node)
        entry["score"] = score
        scored.append(entry)

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def rebuild_from_sqlite(db_path: Path | str | None = None, driver: Any = None) -> int:
    """Wipes graph and re-hydrates completely from SQLite decisions table."""
    raw_decisions = get_decisions(limit=1000, db_path=db_path)
    dec_objects = [Decision.model_validate(d) for d in raw_decisions]

    reset_mock_graph()
    load_decisions(dec_objects, driver=driver, db_path=db_path)
    return len(dec_objects)
