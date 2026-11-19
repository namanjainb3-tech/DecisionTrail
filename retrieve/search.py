from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from core.db_sqlite import search_comments_bm25
from graph.code_linker import find_decisions_for_path, resolve_ancestor_paths
from graph.loader import get_decision, get_mock_graph_state, search_vector

logger = logging.getLogger(__name__)


def search_candidates(
    changed_files: list[str],
    pr_title: str = "",
    pr_diff_summary: str = "",
    top_k: int = 10,
    driver: Any = None,
    db_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    """Generates candidate decisions by combining graph proximity and hybrid lexical/vector search."""
    candidates_by_id: dict[str, dict[str, Any]] = {}

    # 1. Structural Graph Proximity Lookup
    for path in changed_files:
        norm_path = path.strip().replace("\\", "/")
        path_obj = Path(norm_path)
        dir_path = str(path_obj.parent).replace("\\", "/")

        # Direct file or historical rename match: weight 1.0
        exact_matches = find_decisions_for_path(norm_path, driver=driver)
        for d in exact_matches:
            dec_id = d["id"]
            if dec_id not in candidates_by_id:
                candidates_by_id[dec_id] = {
                    "decision": d,
                    "graph_score": 1.0,
                    "bm25_rank": None,
                    "vector_score": 0.0,
                    "matched_paths": [norm_path],
                }
            else:
                candidates_by_id[dec_id]["graph_score"] = max(
                    candidates_by_id[dec_id]["graph_score"], 1.0
                )
                if norm_path not in candidates_by_id[dec_id]["matched_paths"]:
                    candidates_by_id[dec_id]["matched_paths"].append(norm_path)

        # Directory proximity match: weight 0.5 for sibling files
        if dir_path and dir_path != ".":
            mock_nodes = get_mock_graph_state()["nodes"]
            for node_id, node in mock_nodes.items():
                if node.get("type") == "File":
                    f_path = node.get("path", "")
                    if f_path != norm_path and str(Path(f_path).parent).replace("\\", "/") == dir_path:
                        dir_decisions = find_decisions_for_path(f_path, driver=driver)
                        for d in dir_decisions:
                            dec_id = d["id"]
                            if dec_id not in candidates_by_id:
                                candidates_by_id[dec_id] = {
                                    "decision": d,
                                    "graph_score": 0.5,
                                    "bm25_rank": None,
                                    "vector_score": 0.0,
                                    "matched_paths": [f_path],
                                }
                            else:
                                candidates_by_id[dec_id]["graph_score"] = max(
                                    candidates_by_id[dec_id]["graph_score"], 0.5
                                )

    # 2. Hybrid Lexical (BM25) & Semantic Vector Search
    query_text = f"{pr_title} {pr_diff_summary}".strip()
    if query_text:
        # BM25 Keyword Search
        bm25_hits = search_comments_bm25(query_text, limit=20, db_path=db_path)
        for rank, hit in enumerate(bm25_hits, start=1):
            thread_id = hit.get("thread_id", "")
            # Look up decision associated with this thread
            mock_nodes = get_mock_graph_state()["nodes"]
            for node_id, node in mock_nodes.items():
                if node.get("type") == "Decision":
                    if node.get("thread_id") == thread_id or thread_id in node.get("id", ""):
                        dec_id = node["id"]
                        if dec_id not in candidates_by_id:
                            candidates_by_id[dec_id] = {
                                "decision": node,
                                "graph_score": 0.0,
                                "bm25_rank": rank,
                                "vector_score": 0.0,
                                "matched_paths": [],
                            }
                        elif candidates_by_id[dec_id]["bm25_rank"] is None:
                            candidates_by_id[dec_id]["bm25_rank"] = rank

        # Vector Dense Semantic Search
        vector_hits = search_vector(query_text, top_k=top_k, driver=driver)
        for v in vector_hits:
            dec_id = v.get("id")
            if not dec_id:
                continue
            v_score = v.get("score", 0.0)
            if dec_id not in candidates_by_id:
                candidates_by_id[dec_id] = {
                    "decision": v,
                    "graph_score": 0.0,
                    "bm25_rank": None,
                    "vector_score": v_score,
                    "matched_paths": [],
                }
            else:
                candidates_by_id[dec_id]["vector_score"] = max(
                    candidates_by_id[dec_id]["vector_score"], v_score
                )

    # 3. Score Fusion: Graph Proximity + Reciprocal Rank Fusion (RRF)
    scored_candidates = []
    for dec_id, item in candidates_by_id.items():
        # Ensure full decision payload is loaded
        full_decision = get_decision(dec_id, driver=driver) or item["decision"]
        item["decision"] = full_decision

        graph_score = item["graph_score"]
        vector_score = item["vector_score"]

        rrf_text_score = 0.0
        if item["bm25_rank"] is not None:
            rrf_text_score += 1.0 / (60.0 + item["bm25_rank"])
        if vector_score > 0:
            rrf_text_score += vector_score * 0.5

        # Combined composite score
        total_score = graph_score * 0.6 + rrf_text_score * 0.4
        item["score"] = total_score
        item["id"] = dec_id
        scored_candidates.append(item)

    scored_candidates.sort(key=lambda x: x["score"], reverse=True)
    return scored_candidates[:top_k]

