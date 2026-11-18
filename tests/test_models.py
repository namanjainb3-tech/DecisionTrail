import pytest
from datetime import datetime
from pydantic import ValidationError
from core.models import Evidence, RejectedAlternative, Decision, Document, Comment


def test_evidence_model_valid():
    ev = Evidence(
        source_url="https://github.com/psf/black/issues/123#issuecomment-456",
        platform="github_issue",
        author_handle="ambv",
        posted_at=datetime.fromisoformat("2022-01-15T12:00:00"),
        quote="We decided to use pathlib because of Windows slashes."
    )
    assert ev.author_handle == "ambv"
    assert ev.platform == "github_issue"


def test_decision_with_empty_evidence_fails():
    with pytest.raises(ValidationError) as exc_info:
        Decision(
            id="sha1_test_id",
            repo_or_forum="psf/black",
            thread_id="123",
            title="Use pathlib instead of os.path",
            outcome="adopted",
            rationale="Unified path handling across platforms",
            alternatives=[],
            evidence=[],  # Empty evidence must fail!
            confidence=0.95,
            decided_at=datetime.now(),
            linked_paths=["src/black/files.py"],
            extractor_model="gpt-oss-20b"
        )
    assert "evidence" in str(exc_info.value)


def test_decision_with_valid_evidence_succeeds():
    ev = Evidence(
        source_url="https://github.com/psf/black/issues/123#issuecomment-456",
        platform="github_issue",
        author_handle="ambv",
        posted_at=datetime.fromisoformat("2022-01-15T12:00:00"),
        quote="We decided to use pathlib because of Windows slashes."
    )
    alt = RejectedAlternative(
        text="Keep os.path with custom normalize function",
        reason="Too error prone on UNC paths",
        evidence=ev
    )
    d = Decision(
        id="sha1_test_id",
        repo_or_forum="psf/black",
        thread_id="123",
        title="Use pathlib instead of os.path",
        outcome="adopted",
        rationale="Unified path handling across platforms",
        alternatives=[alt],
        evidence=[ev],
        confidence=0.95,
        decided_at=datetime.now(),
        linked_paths=["src/black/files.py"],
        extractor_model="gpt-oss-20b"
    )
    assert d.title == "Use pathlib instead of os.path"
    assert len(d.evidence) == 1
    assert len(d.alternatives) == 1


def test_document_and_comment_models():
    c = Comment(
        comment_id="c_1",
        author_handle="gvanrossum",
        author_email=None,
        posted_at=datetime.now(),
        body="Looks reasonable to me.",
        url="https://discuss.python.org/t/1/1"
    )
    doc = Document(
        thread_id="t_1",
        platform="discourse",
        url="https://discuss.python.org/t/1",
        title="PEP Discussion",
        created_at=datetime.now(),
        comments=[c]
    )
    assert doc.thread_id == "t_1"
    assert len(doc.comments) == 1

