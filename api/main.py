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


