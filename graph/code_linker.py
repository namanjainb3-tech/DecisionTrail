from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any
from core.db_neo4j import check_neo4j_connection, get_neo4j_driver
from core.db_sqlite import save_decision
from core.models import Decision
from graph.loader import get_mock_graph_state

logger = logging.getLogger(__name__)

# Fallback in-memory rename mapping: new_path -> list of old_paths
_rename_chains: dict[str, set[str]] = {}


def reset_rename_chains() -> None:
    global _rename_chains
    _rename_chains = {}


def record_file_rename(old_path: str, new_path: str, driver: Any = None) -> None:
    if not old_path or not new_path or old_path == new_path:
        return

    # Track in-memory
    _rename_chains.setdefault(new_path, set()).add(old_path)
    # Transitive propagation: if old_path was itself renamed from older_path, copy them
    if old_path in _rename_chains:
        _rename_chains[new_path].update(_rename_chains[old_path])

    # Also record as edge in mock graph
    mock_graph = get_mock_graph_state()
    old_file_id = f"file_{old_path}"
    new_file_id = f"file_{new_path}"
    mock_graph["nodes"][old_file_id] = {"id": old_file_id, "type": "File", "path": old_path}
    mock_graph["nodes"][new_file_id] = {"id": new_file_id, "type": "File", "path": new_path}
    mock_graph["edges"].append(
        {"source": old_file_id, "target": new_file_id, "type": "RENAMED_TO"}
    )

    # Neo4j if live
    is_live = False
    try:
        d = driver or get_neo4j_driver()
        is_live = check_neo4j_connection(d)
    except Exception:
        is_live = False

    if is_live:
        with d.session() as session:
            session.run(
                """
                MERGE (f_old:File {path: $old_path})
                MERGE (f_new:File {path: $new_path})
                MERGE (f_old)-[:RENAMED_TO]->(f_new)
                """,
                {"old_path": old_path, "new_path": new_path},
            )


def resolve_ancestor_paths(query_path: str, driver: Any = None) -> list[str]:
    """Resolves all historical paths that were renamed into `query_path` (including `query_path` itself)."""
    ancestors = {query_path}

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
                MATCH (target:File {path: $path})<-[:RENAMED_TO*0..]-(origin:File)
                RETURN origin.path as path
                """,
                {"path": query_path},
            )
            for record in result:
                ancestors.add(record["path"])
        return list(ancestors)

    # Mock in-memory traversal
    queue = [query_path]
    visited = set()
    while queue:
        curr = queue.pop(0)
        if curr in visited:
            continue
        visited.add(curr)
        ancestors.add(curr)
        for prev in _rename_chains.get(curr, set()):
            if prev not in visited:
                queue.append(prev)

    return list(ancestors)


def is_revert_pr(title: str) -> bool:
    if not title:
        return False
    return bool(re.search(r"^revert(\s+[\"']|:|\s+)", title.strip(), re.IGNORECASE))


def link_decisions_to_code(
    decisions: list[Decision],
    pr_files_map: dict[str, list[dict[str, Any]]],
    issue_to_pr_map: dict[str, str] | None = None,
    discourse_to_pr_map: dict[str, str] | None = None,
    driver: Any = None,
    db_path: Path | str | None = None,
) -> None:
    issue_map = issue_to_pr_map or {}
    disc_map = discourse_to_pr_map or {}

    for dec in decisions:
        pr_number: str | None = None
        parts = dec.thread_id.split("_")
        tail_id = parts[-1]

        # Check direct PR match by full thread_id or numeric tail
        if dec.thread_id in pr_files_map:
            pr_number = dec.thread_id
        elif tail_id in pr_files_map:
            pr_number = tail_id
        elif dec.thread_id in issue_map:
            pr_number = issue_map[dec.thread_id]
        elif tail_id in issue_map:
            pr_number = issue_map[tail_id]
        elif dec.thread_id in disc_map:
            pr_number = disc_map[dec.thread_id]
        elif tail_id in disc_map:
            pr_number = disc_map[tail_id]

        if not pr_number or pr_number not in pr_files_map:
            continue

        files_info = pr_files_map[pr_number]
        affected_paths: list[str] = []

        for f in files_info:
            filename = f.get("filename")
            prev_filename = f.get("previous_filename")
            if filename:
                affected_paths.append(filename)
            if prev_filename and filename:
                record_file_rename(prev_filename, filename, driver=driver)

        # Update decision linked paths
        unique_paths = sorted(list(set(affected_paths)))
        dec.linked_paths = unique_paths

        # Check for Revert PRs
        if is_revert_pr(dec.title):
            dec.outcome = "reverted"

        # Update mock graph
        mock_graph = get_mock_graph_state()
        mock_graph["nodes"][dec.id] = {
            "id": dec.id,
            "type": "Decision",
            "title": dec.title,
            "outcome": dec.outcome,
            "rationale": dec.rationale,
        }
        for path in unique_paths:
            file_id = f"file_{path}"
            mock_graph["nodes"][file_id] = {"id": file_id, "type": "File", "path": path}
            edge = {"source": dec.id, "target": file_id, "type": "AFFECTS"}
            if edge not in mock_graph["edges"]:
                mock_graph["edges"].append(edge)

        # Update SQLite
        save_decision(dec, db_path=db_path)


def find_decisions_for_path(
    path: str,
    driver: Any = None,
) -> list[dict[str, Any]]:
    """Returns all decisions affecting `path` or any of its historical predecessor filenames."""
    all_historic_paths = resolve_ancestor_paths(path, driver=driver)

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
                MATCH (f:File)<-[:AFFECTS]-(d:Decision)
                WHERE f.path IN $paths
                RETURN DISTINCT d
                """,
                {"paths": all_historic_paths},
            )
            return [dict(record["d"]) for record in result]

    # Mock graph lookup
    matching_decisions = []
    mock_graph = get_mock_graph_state()
    nodes = mock_graph["nodes"]
    edges = mock_graph["edges"]

    file_ids = {f"file_{p}" for p in all_historic_paths}
    matched_dec_ids = set()

    for edge in edges:
        if edge["type"] == "AFFECTS" and edge["target"] in file_ids:
            dec_id = edge["source"]
            if dec_id in nodes and dec_id not in matched_dec_ids:
                matched_dec_ids.add(dec_id)
                matching_decisions.append(nodes[dec_id])

    return matching_decisions
