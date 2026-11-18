from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
    repo: str = Field(default="astral-sh/uv", description="Repository identifier")
    changed_files: list[str] = Field(..., description="List of file paths changed in the PR")
    pr_title: str = Field(default="", description="PR title")
    pr_diff_summary: str = Field(default="", description="Summary of the PR diff or description")
    post_to_github: bool = Field(default=False, description="Whether to actually post the comment to GitHub")
    threshold: float = Field(default=0.35, description="Minimum relevance score threshold")


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
        docs = ingest_github_repo(repo=req.repo, limit=req.limit, since=req.since)
        return {
            "status": "success",
            "repo": req.repo,
            "documents_ingested": len(docs),
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


@app.get("/decisions")
def list_decisions(
    q: str | None = None,
    path: str | None = None,
    outcome: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    return get_decisions(q=q, path=path, outcome=outcome, limit=limit)


@app.get("/decisions/{decision_id}")
def get_decision_detail(decision_id: str) -> dict[str, Any]:
    decisions = get_decisions()
    for d in decisions:
        if d["id"] == decision_id:
            return d
    raise HTTPException(status_code=404, detail="Decision not found")


@app.get("/graph")
def get_graph(
    node_id: str | None = None,
    depth: int = 2,
) -> dict[str, Any]:
    state = get_mock_graph_state()
    if not state["nodes"]:
        rebuild_from_sqlite()
        state = get_mock_graph_state()

    if node_id:
        return neighborhood(node_id=node_id, depth=depth)

    # Return full graph snapshot
    nodes = list(state["nodes"].values())
    edges = state["edges"]
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
        result = analyze_pr(
            repo=req.repo,
            changed_files=req.changed_files,
            pr_title=req.pr_title,
            pr_diff_summary=req.pr_diff_summary,
            post_to_github=req.post_to_github,
            threshold=req.threshold,
        )
        return result
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
        summary = evaluate_peps(
            pep_numbers=req.pep_numbers,
            limit=req.limit,
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
