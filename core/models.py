from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator


class Evidence(BaseModel):
    source_url: str
    platform: Literal["github_issue", "github_pr", "github_review", "discourse"]
    author_handle: str
    posted_at: datetime
    quote: str  # verbatim, must exist in source text


class RejectedAlternative(BaseModel):
    text: str  # what was proposed
    reason: str  # why it was rejected
    evidence: Evidence


class Decision(BaseModel):
    id: str  # sha1 of (thread_id + title)
    repo_or_forum: str
    thread_id: str
    title: str  # short, e.g. "Use pathlib instead of os.path"
    outcome: Literal["adopted", "rejected", "reverted", "deferred"]
    rationale: str
    alternatives: list[RejectedAlternative] = []
    evidence: list[Evidence] = Field(..., min_length=1)  # at least one
    confidence: float  # 0 to 1, from extractor
    decided_at: datetime | None = None
    linked_paths: list[str] = []
    extractor_model: str

    @field_validator("evidence")
    @classmethod
    def validate_evidence_not_empty(cls, v: list[Evidence]) -> list[Evidence]:
        if not v:
            raise ValueError("Decision must contain at least one evidence item")
        return v

    @field_validator("confidence")
    @classmethod
    def validate_confidence_range(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError("Confidence must be between 0.0 and 1.0")
        return v


class Comment(BaseModel):
    comment_id: str
    author_handle: str
    author_email: str | None = None
    posted_at: datetime
    body: str
    url: str


class Document(BaseModel):  # one thread (issue, PR or topic)
    thread_id: str
    platform: str
    url: str
    title: str
    created_at: datetime
    comments: list[Comment] = []

