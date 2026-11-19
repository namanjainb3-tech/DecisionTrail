from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.config import settings
from core.db_sqlite import get_db, get_decisions, init_db
from core.models import Decision
from graph.loader import get_mock_graph_state, get_neighborhood as neighborhood, rebuild_from_sqlite
from bot.analyze import analyze_pr
from memory.feedback_memory import get_feedback_memory, VerdictType
from ingest.github_ingest import ingest_github_repo
from ingest.discourse_ingest import ingest_discourse_topic
from extract.extractor import run_extraction_pipeline
from eval.run_eval import evaluate_peps

logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        existing = get_decisions()
        if not existing:
            logger.info("Empty database detected on startup. Preloading authentic decisions...")
            from scripts.preload_demo_cache import preload_demo_data
            preload_demo_data()
        rebuild_from_sqlite()
    except Exception as e:
        logger.warning(f"Initial graph rebuild skipped: {e}")
    yield

app = FastAPI(
    title="DecisionTrail API",
    description="Surfaces past architectural and design decisions with verbatim verified citations.",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend or local developer testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class IngestGithubRequest(BaseModel):
    repo: str = Field(..., description="Target GitHub repository, e.g. 'astral-sh/uv'")
    limit: int = Field(default=50, description="Max issues/PRs to fetch")
    since: str | None = Field(default=None, description="ISO timestamp cursor")


class IngestDiscourseRequest(BaseModel):
    topic_url: str = Field(..., description="Discourse topic URL, e.g. 'https://discuss.python.org/t/pep-582/123'")


class ExtractRunRequest(BaseModel):
    thread_ids: list[str] | None = Field(default=None, description="Optional specific thread IDs to extract")


class PRAnalyzeRequest(BaseModel):
    repo: str = Field(default="django/django", description="Repository identifier")
    changed_files: list[str] = Field(..., description="List of file paths changed in the PR")
    pr_title: str = Field(default="", description="PR title")
    pr_diff_summary: str = Field(default="", description="Summary of the PR diff or description")
    post_to_github: bool = Field(default=False, description="Whether to actually post the comment to GitHub")
    threshold: float = Field(default=0.25, description="Minimum relevance score threshold")
    groq_api_key: str | None = Field(default=None, description="Optional custom Groq API key for acceleration")


class FeedbackRequest(BaseModel):
    decision_id: str
    path: str
    verdict: VerdictType
    note: str | None = None


class EvalRunRequest(BaseModel):
    pep_numbers: list[int] | None = None
    limit: int | None = None


# ---------------------------------------------------------------------------
# Core Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest/github")
def api_ingest_github(req: IngestGithubRequest) -> dict[str, Any]:
    try:
        import re
        from ingest.github_ingest import clean_repo_name, ingest_single_github_issue

        # Check if user passed a specific PR or Issue URL (e.g. https://github.com/org/repo/pull/123 or org/repo#123)
        single_match = re.search(r"(?:https?://)?(?:www\.)?github\.com/([^/]+/[^/]+)/(?:pull|issues)/(\d+)", req.repo.strip())
        if not single_match:
            single_match = re.search(r"^([^/]+/[^/]+)(?:/(?:pull|issues)/|#)(\d+)$", req.repo.strip())
        if single_match:
            clean_repo = single_match.group(1).strip()
            number = int(single_match.group(2))
            doc = ingest_single_github_issue(repo=clean_repo, number=number)
            if not doc:
                raise HTTPException(status_code=404, detail=f"Could not fetch PR/Issue #{number} from {clean_repo}")
            extracted = run_extraction_pipeline(thread_ids=[doc.thread_id])
            rebuild_from_sqlite()
            return {
                "status": "success",
                "repo": clean_repo,
                "is_single_pr": True,
                "thread_id": doc.thread_id,
                "title": doc.title,
                "number": number,
                "documents_ingested": 1,
                "decisions_extracted": len(extracted),
            }

        clean_repo = clean_repo_name(req.repo)

        # Ingest recent issues and discussions
        docs = ingest_github_repo(repo=clean_repo, limit=req.limit, since=req.since)
        
        # Automatically extract decisions and update knowledge graph
        extracted = []
        if docs:
            new_threads = [d.thread_id for d in docs]
            extracted = run_extraction_pipeline(thread_ids=new_threads)
            rebuild_from_sqlite()

        return {
            "status": "success",
            "repo": clean_repo,
            "documents_ingested": len(docs),
            "decisions_extracted": len(extracted),
        }
    except Exception as e:
        logger.exception("GitHub ingestion failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/discourse")
def api_ingest_discourse(req: IngestDiscourseRequest) -> dict[str, Any]:
    try:
        doc = ingest_discourse_topic(topic_url=req.topic_url)
        if not doc:
            raise HTTPException(status_code=400, detail="Failed to ingest Discourse topic")
        return {
            "status": "success",
            "thread_id": doc.thread_id,
            "comments_count": len(doc.comments),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Discourse ingestion failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract/run")
def api_extract_run(req: ExtractRunRequest) -> dict[str, Any]:
    try:
        decisions = run_extraction_pipeline(thread_ids=req.thread_ids)
        # Refresh graph
        rebuild_from_sqlite()
        return {
            "status": "success",
            "extracted_count": len(decisions),
            "decision_ids": [d.id for d in decisions],
        }
    except Exception as e:
        logger.exception("Extraction pipeline failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/repositories")
def list_repositories() -> list[str]:
    from core.db_sqlite import get_repositories
    return get_repositories()


class DeleteRepoRequest(BaseModel):
    repo: str


@app.delete("/repositories/{repo:path}")
def api_delete_repository_path(repo: str) -> dict[str, Any]:
    from urllib.parse import unquote
    clean_repo = unquote(repo).strip()
    return _do_delete_repo(clean_repo)


@app.post("/repositories/delete")
def api_delete_repository_post(req: DeleteRepoRequest) -> dict[str, Any]:
    return _do_delete_repo(req.repo.strip())


def _do_delete_repo(repo: str) -> dict[str, Any]:
    from core.db_sqlite import delete_repository
    from graph.loader import rebuild_from_sqlite
    counts = delete_repository(repo)
    rebuild_from_sqlite()
    return {
        "status": "success",
        "repo": repo,
        "deleted_decisions": counts["deleted_decisions"],
        "deleted_documents": counts["deleted_documents"],
    }


@app.get("/decisions")
def list_decisions(
    q: str | None = None,
    path: str | None = None,
    outcome: str | None = None,
    repo: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    return get_decisions(q=q, path=path, outcome=outcome, repo=repo, limit=limit)


@app.get("/decisions/{decision_id}")
def get_decision_detail(decision_id: str) -> dict[str, Any]:
    decisions = get_decisions()
    for d in decisions:
        if d["id"] == decision_id:
            return d
    raise HTTPException(status_code=404, detail="Decision not found")


@app.get("/discussions")
def list_discussions(
    repo: str | None = None,
    q: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    from core.db_sqlite import get_discussions_summary
    return get_discussions_summary(repo=repo, q=q, limit=limit)


@app.get("/discussions/{thread_id:path}")
def get_discussion(thread_id: str) -> dict[str, Any]:
    from urllib.parse import unquote
    from core.db_sqlite import get_discussion_detail
    clean_id = unquote(thread_id)
    doc = get_discussion_detail(clean_id) or get_discussion_detail(thread_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Discussion thread not found")
    return doc


@app.get("/graph/status")
def api_graph_status() -> dict[str, Any]:
    from core.db_neo4j import get_neo4j_status
    status = get_neo4j_status()
    state = get_mock_graph_state()
    if not state["nodes"]:
        try:
            rebuild_from_sqlite()
            state = get_mock_graph_state()
        except Exception:
            pass
    status["node_count"] = len(state["nodes"])
    status["edge_count"] = len(state["edges"])
    return status


@app.get("/graph")
def get_graph(
    node_id: str | None = None,
    depth: int = 2,
    repo: str | None = None,
) -> dict[str, Any]:
    state = get_mock_graph_state()
    if not state["nodes"]:
        rebuild_from_sqlite()
        state = get_mock_graph_state()

    if node_id:
        return neighborhood(node_id=node_id, depth=depth)

    # Return full graph snapshot or filter by repo
    nodes = list(state["nodes"].values())
    edges = state["edges"]

    if repo and repo.lower() != "all":
        target_repo_clean = repo.lower().strip()
        matching_seed_ids: set[str] = set()
        for n in nodes:
            n_repo = (n.get("repo_or_forum") or "").lower()
            n_id = n.get("id", "").lower()
            n_name = (n.get("name") or "").lower()
            n_tid = (n.get("thread_id") or "").lower()
            if (
                n_repo == target_repo_clean
                or target_repo_clean in n_repo
                or target_repo_clean in n_id
                or target_repo_clean in n_name
                or target_repo_clean in n_tid
            ):
                matching_seed_ids.add(n["id"])

        connected_node_ids = set(matching_seed_ids)
        # 2-hop BFS expansion
        for _ in range(2):
            for e in edges:
                src, tgt = e["source"], e["target"]
                if src in connected_node_ids or tgt in connected_node_ids:
                    connected_node_ids.add(src)
                    connected_node_ids.add(tgt)

        filtered_edges = [
            e for e in edges
            if e["source"] in connected_node_ids and e["target"] in connected_node_ids
        ]
        filtered_nodes = [n for n in nodes if n["id"] in connected_node_ids]
        return {
            "nodes": filtered_nodes,
            "edges": filtered_edges,
            "summary": {
                "node_count": len(filtered_nodes),
                "edge_count": len(filtered_edges),
            },
        }

    return {
        "nodes": nodes,
        "edges": edges,
        "summary": {
            "node_count": len(nodes),
            "edge_count": len(edges),
        },
    }


@app.post("/pr/analyze")
def api_pr_analyze(req: PRAnalyzeRequest) -> dict[str, Any]:
    try:
        state = get_mock_graph_state()
        if not state["nodes"]:
            rebuild_from_sqlite()

        orig_key = settings.GROQ_API_KEY
        if req.groq_api_key and len(req.groq_api_key) > 15:
            settings.GROQ_API_KEY = req.groq_api_key

        try:
            result = analyze_pr(
                repo=req.repo,
                changed_files=req.changed_files,
                pr_title=req.pr_title,
                pr_diff_summary=req.pr_diff_summary,
                post_to_github=req.post_to_github,
                threshold=req.threshold,
            )
            return result
        finally:
            settings.GROQ_API_KEY = orig_key
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as e:
        logger.exception("PR analysis failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/feedback")
def api_feedback(req: FeedbackRequest) -> dict[str, Any]:
    try:
        mem = get_feedback_memory()
        mem.record(
            decision_id=req.decision_id,
            path=req.path,
            verdict=req.verdict,
            note=req.note,
        )
        return {
            "status": "success",
            "decision_id": req.decision_id,
            "path": req.path,
            "verdict": req.verdict,
        }
    except Exception as e:
        logger.exception("Failed to record feedback")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/eval/run")
def api_eval_run(req: EvalRunRequest) -> dict[str, Any]:
    try:
        from eval.benchmark_data import run_live_benchmark
        summary = run_live_benchmark(
            pep_numbers=req.pep_numbers,
            db_path=settings.SQLITE_DB_PATH,
        )
        return summary
    except Exception as e:
        logger.exception("Evaluation benchmark failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/eval/results")
def api_eval_results() -> dict[str, Any]:
    conn = get_db()
    cursor = conn.execute(
        """
        SELECT pep_number, ground_truth_count, predicted_count, matched_count,
               recall, precision, details, run_at
        FROM eval_results
        ORDER BY id DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()

    results = []
    total_gt = 0
    total_matched = 0
    total_pred = 0

    seen_peps: set[int] = set()
    for row in rows:
        pep_num = row["pep_number"]
        if pep_num in seen_peps:
            continue
        seen_peps.add(pep_num)

        gt = row["ground_truth_count"]
        pred = row["predicted_count"]
        matched = row["matched_count"]

        total_gt += gt
        total_pred += pred
        total_matched += matched

        details = json.loads(row["details"]) if row["details"] else []
        results.append({
            "pep_number": pep_num,
            "ground_truth_count": gt,
            "predicted_count": pred,
            "matched_count": matched,
            "recall": row["recall"],
            "precision_lb": row["precision"],
            "matches": details,
            "run_at": row["run_at"],
        })

    overall_recall = total_matched / total_gt if total_gt > 0 else 0.0
    overall_precision_lb = total_matched / total_pred if total_pred > 0 else 0.0

    return {
        "peps_evaluated": len(results),
        "total_ground_truth": total_gt,
        "total_recovered": total_matched,
        "total_predicted": total_pred,
        "overall_recall": round(overall_recall, 3),
        "overall_precision_lb": round(overall_precision_lb, 3),
        "results": results,
    }
