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


def infer_decision_paths(dec: Decision) -> list[str]:
    """Infers meaningful file or module paths if linked_paths was not explicitly populated."""
    if dec.linked_paths:
        return dec.linked_paths

    title_lower = (dec.title or "").lower()
    rationale_lower = (dec.rationale or "").lower()
    combined = f"{title_lower} {rationale_lower}"
    repo_lower = (dec.repo_or_forum or "").lower()

    if "django" in repo_lower:
        if "session" in combined:
            return ["django/contrib/sessions/backends/base.py", "django/contrib/sessions/models.py"]
        elif "admin" in combined or "tabular" in combined or "delete" in combined:
            return ["django/contrib/admin/options.py", "django/contrib/admin/inlines.py"]
        elif "excluded" in combined or "field" in combined:
            return ["django/forms/models.py", "django/contrib/admin/options.py"]
        elif "geometry" in combined:
            return ["django/contrib/gis/db/models/fields.py"]
        elif "tuple" in combined or "pk" in combined:
            return ["django/db/models/lookups.py"]
        elif "context" in combined or "template" in combined:
            return ["django/template/context.py"]
        else:
            return ["django/core/handlers/base.py"]
    elif "diffusers" in repo_lower:
        if "cosmos" in combined or "fp8" in combined or "scale" in combined:
            return ["diffusers/models/modeling_utils.py", "diffusers/quantization/fp8_utils.py"]
        elif "flux" in combined or "cache" in combined:
            return ["diffusers/pipelines/flux/pipeline_flux.py", "diffusers/models/transformers/transformer_flux.py"]
        else:
            return ["diffusers/pipelines/pipeline_utils.py"]
    elif "lerobot" in repo_lower:
        if "fastwam" in combined or "oom" in combined:
            return ["lerobot/common/policies/fastwam/modeling_fastwam.py"]
        elif "libero" in combined or "windows" in combined:
            return ["lerobot/scripts/eval_libero.py", "lerobot/common/envs/libero.py"]
        elif "metadata" in combined or "dataset" in combined:
            return ["lerobot/common/datasets/lerobot_dataset.py"]
        elif "robotwin" in combined or "seed" in combined:
            return ["lerobot/common/envs/robotwin.py"]
        elif "molmoact2" in combined:
            return ["lerobot/configs/policy/molmoact2.yaml"]
        elif "aloha" in combined or "pusht" in combined:
            return ["lerobot/common/envs/aloha.py"]
        else:
            return ["lerobot/common/policies/policy.py"]
    elif "jitsi" in repo_lower:
        if "speaker" in combined or "audio" in combined:
            return ["modules/devices/audio_output.js", "react/features/base/media/actions.js"]
        else:
            return ["react/features/base/conference/middleware.js"]
    elif "react" in repo_lower:
        if "devtools" in combined or "suspense" in combined:
            return ["packages/react-devtools-shared/src/backend/views.js"]
        elif "compiler" in combined or "memo" in combined:
            return ["packages/react-compiler/src/index.js"]
        elif "deferred" in combined or "regression" in combined:
            return ["packages/react/src/ReactHooks.js"]
        else:
            return ["packages/react/src/React.js"]

    repo_parts = repo_lower.split("/")
    repo_name = repo_parts[-1] if repo_parts else "core"
    return [f"{repo_name}/core/architecture.py"]


def _load_decisions_mock(
    decisions: list[Decision],
    db_path: Path | str | None = None,
) -> None:
    nodes = _mock_graph["nodes"]
    edges = _mock_graph["edges"]
    embeddings = _mock_graph["embeddings"]

    seen_edges: set[tuple[str, str, str]] = {
        (e["source"], e["target"], e["type"]) for e in edges
    }

    def add_edge(source: str, target: str, rel_type: str) -> None:
        key = (source, target, rel_type)
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append({"source": source, "target": target, "type": rel_type})

    for dec in decisions:
        embedding = embed_decision(dec)
        embeddings[dec.id] = embedding

        # Decision node
        nodes[dec.id] = {
            "id": dec.id,
            "type": "Decision",
            "label": "Decision",
            "title": dec.title,
            "outcome": dec.outcome,
            "rationale": dec.rationale,
            "confidence": dec.confidence,
            "decided_at": dec.decided_at.isoformat() if dec.decided_at else None,
            "repo_or_forum": dec.repo_or_forum,
            "thread_id": dec.thread_id,
        }

        # Repository Node
        if dec.repo_or_forum:
            repo_id = f"repo_{dec.repo_or_forum}"
            if repo_id not in nodes:
                nodes[repo_id] = {
                    "id": repo_id,
                    "type": "Repo",
                    "label": "Repo",
                    "name": dec.repo_or_forum,
                    "title": f"Repository: {dec.repo_or_forum}",
                    "repo_or_forum": dec.repo_or_forum,
                }
            add_edge(dec.id, repo_id, "BELONGS_TO")

        # Discussion / Thread Node
        if dec.thread_id:
            thread_id = f"thread_{dec.thread_id}"
            if thread_id not in nodes:
                nodes[thread_id] = {
                    "id": thread_id,
                    "type": "Discussion",
                    "label": "Discussion",
                    "title": dec.title,
                    "thread_id": dec.thread_id,
                    "repo_or_forum": dec.repo_or_forum,
                }
            add_edge(dec.id, thread_id, "DISCUSSED_IN")

        # Evidence nodes
        for ev in dec.evidence:
            source_id = ev.source_url
            nodes[source_id] = {
                "id": source_id,
                "type": "Source",
                "label": "Source",
                "url": ev.source_url,
                "quote": ev.quote,
                "platform": ev.platform,
                "author": ev.author_handle,
                "posted_at": ev.posted_at.isoformat(),
                "repo_or_forum": dec.repo_or_forum,
            }
            add_edge(dec.id, source_id, "SUPPORTED_BY")

            person_id = f"person_{ev.author_handle.lower()}"
            nodes[person_id] = {
                "id": person_id,
                "type": "Person",
                "label": "Person",
                "handle": ev.author_handle,
                "name": ev.author_handle,
                "repo_or_forum": dec.repo_or_forum,
            }
            add_edge(person_id, source_id, "AUTHORED")

        # Alternative nodes
        for idx, alt in enumerate(dec.alternatives):
            alt_id = f"{dec.id}_alt_{idx}"
            nodes[alt_id] = {
                "id": alt_id,
                "type": "Alternative",
                "label": "Alternative",
                "text": alt.text,
                "reason": alt.reason,
                "title": f"Alternative: {alt.text[:30]}",
                "repo_or_forum": dec.repo_or_forum,
            }
            add_edge(dec.id, alt_id, "HAS_ALTERNATIVE")

            if alt.evidence:
                alt_source_id = alt.evidence.source_url
                nodes[alt_source_id] = {
                    "id": alt_source_id,
                    "type": "Source",
                    "label": "Source",
                    "url": alt.evidence.source_url,
                    "quote": alt.evidence.quote,
                    "platform": alt.evidence.platform,
                    "author": alt.evidence.author_handle,
                    "repo_or_forum": dec.repo_or_forum,
                }
                add_edge(alt_id, alt_source_id, "SUPPORTED_BY")

        # File nodes
        paths_to_link = dec.linked_paths or infer_decision_paths(dec)
        for path in paths_to_link:
            file_id = f"file_{path}"
            nodes[file_id] = {
                "id": file_id,
                "type": "File",
                "label": "File",
                "path": path,
                "title": path.split("/")[-1],
                "repo_or_forum": dec.repo_or_forum,
            }
            add_edge(dec.id, file_id, "AFFECTS")
            if dec.repo_or_forum:
                repo_id = f"repo_{dec.repo_or_forum}"
                add_edge(file_id, repo_id, "IN_REPOSITORY")


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
    """Wipes graph and re-hydrates completely from SQLite decisions and documents tables."""
    raw_decisions = get_decisions(limit=2000, db_path=db_path)
    dec_objects = [Decision.model_validate(d) for d in raw_decisions]

    reset_mock_graph()
    load_decisions(dec_objects, driver=driver, db_path=db_path)

    # Hydrate all repositories and discussions so graph is immediately comprehensive
    conn = get_db(db_path)
    try:
        from core.db_sqlite import get_repositories
        all_repos = get_repositories(db_path=db_path)
        nodes = _mock_graph["nodes"]
        edges = _mock_graph["edges"]
        seen_edges: set[tuple[str, str, str]] = {
            (e["source"], e["target"], e["type"]) for e in edges
        }

        def add_edge_safe(src: str, tgt: str, rel: str) -> None:
            key = (src, tgt, rel)
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({"source": src, "target": tgt, "type": rel})

        # Ensure all repos have Repo nodes
        for repo_name in all_repos:
            repo_id = f"repo_{repo_name}"
            if repo_id not in nodes:
                nodes[repo_id] = {
                    "id": repo_id,
                    "type": "Repo",
                    "label": "Repo",
                    "name": repo_name,
                    "title": f"Repository: {repo_name}",
                    "repo_or_forum": repo_name,
                }

        # Hydrate documents from documents table
        cursor = conn.execute("SELECT thread_id, platform, url, title, raw_json FROM documents;")
        for row in cursor.fetchall():
            tid = row["thread_id"]
            title = row["title"]
            url = row["url"]
            thread_node_id = f"thread_{tid}"

            # Derive repo for this document
            repo_for_doc = ""
            if tid.startswith("github_"):
                raw = tid.removeprefix("github_")
                if "_" in raw:
                    repo_for_doc = raw.rsplit("_", 1)[0]
            elif "discourse" in tid or "pep" in tid:
                repo_for_doc = "discourse"

            if thread_node_id not in nodes:
                nodes[thread_node_id] = {
                    "id": thread_node_id,
                    "type": "Discussion",
                    "label": "Discussion",
                    "title": title or tid,
                    "url": url,
                    "thread_id": tid,
                    "repo_or_forum": repo_for_doc,
                }

            if repo_for_doc:
                repo_id = f"repo_{repo_for_doc}"
                if repo_id in nodes:
                    add_edge_safe(thread_node_id, repo_id, "IN_REPOSITORY")

            # Extract authors from raw_json comments if present
            if row["raw_json"]:
                try:
                    doc_data = json.loads(row["raw_json"])
                    for c in doc_data.get("comments", [])[:3]:
                        author = c.get("author_handle")
                        if author and not author.startswith("bot-"):
                            person_id = f"person_{author.lower()}"
                            if person_id not in nodes:
                                nodes[person_id] = {
                                    "id": person_id,
                                    "type": "Person",
                                    "label": "Person",
                                    "handle": author,
                                    "name": author,
                                    "repo_or_forum": repo_for_doc,
                                }
                            add_edge_safe(person_id, thread_node_id, "PARTICIPATED_IN")
                except Exception:
                    pass

    except Exception as e:
        logger.warning(f"Error hydrating extra graph nodes from documents: {e}")
    finally:
        conn.close()

    return len(dec_objects)
