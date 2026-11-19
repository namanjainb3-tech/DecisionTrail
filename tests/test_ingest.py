import json
from pathlib import Path
import httpx
import pytest
from core.db_sqlite import get_cursor, get_db, init_db
from ingest.discourse_ingest import clean_html_to_text, extract_topic_id, ingest_discourse_topic
from ingest.github_ingest import ingest_github_repo, is_bot_account
from ingest.identity import hash_email, normalize_handle, resolve_canonical_person

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_html_cleaning():
    html_sample = """
    <p>Hello <b>world</b>!</p>
    <aside class="quote"><blockquote>Previous comment text</blockquote></aside>
    <p>We rejected <code>switch</code> &amp; decided on <code>match</code>.</p>
    """
    clean = clean_html_to_text(html_sample)
    assert "<p>" not in clean
    assert "<b>" not in clean
    assert "&amp;" not in clean
    assert "&" in clean
    assert "Hello world!" in clean
    assert "> Previous comment text" in clean
    assert "We rejected switch & decided on match." in clean


def test_extract_topic_id():
    assert extract_topic_id("https://discuss.python.org/t/pep-622-structural-pattern-matching/4700") == "4700"
    assert extract_topic_id("https://discuss.python.org/t/4700/") == "4700"
    assert extract_topic_id("4700") == "4700"


def test_bot_detection():
    assert is_bot_account("dependabot[bot]") is True
    assert is_bot_account("github-actions") is True
    assert is_bot_account("pre-commit-ci") is True
    assert is_bot_account("ambv") is False
    assert is_bot_account("gvanrossum") is False


def test_identity_resolution(tmp_path: Path):
    db_path = tmp_path / "test_identity.db"
    init_db(db_path)

    # User registers on GitHub
    gh_person = resolve_canonical_person(
        platform="github_issue",
        handle="@GVanRossum",
        email="guido@python.org",
        db_path=db_path
    )
    assert gh_person.startswith("person_")

    # Same handle should return identical person id
    gh_person_again = resolve_canonical_person(
        platform="github_issue",
        handle="gvanrossum",
        db_path=db_path
    )
    assert gh_person_again == gh_person

    # User on Discourse with different handle but same email hash
    disc_person = resolve_canonical_person(
        platform="discourse",
        handle="guido",
        email="GUIDO@python.org ",
        db_path=db_path
    )
    # Must be merged into same canonical person!
    assert disc_person == gh_person


def test_github_ingest_offline_and_idempotency(tmp_path: Path):
    db_path = tmp_path / "test_gh.db"
    init_db(db_path)

    with open(FIXTURES_DIR / "github" / "issues.json", "r", encoding="utf-8") as f:
        issues_fixture = json.load(f)
    with open(FIXTURES_DIR / "github" / "comments_101.json", "r", encoding="utf-8") as f:
        comments_101_fixture = json.load(f)
    with open(FIXTURES_DIR / "github" / "files_102.json", "r", encoding="utf-8") as f:
        files_102_fixture = json.load(f)

    def mock_handler(request: httpx.Request):
        url = str(request.url)
        if "issues?state=closed" in url:
            return httpx.Response(200, json=issues_fixture)
        elif "issues/101/comments" in url:
            return httpx.Response(200, json=comments_101_fixture)
        elif "pulls/102/comments" in url:
            return httpx.Response(200, json=[])
        elif "pulls/102/files" in url:
            return httpx.Response(200, json=files_102_fixture)
        return httpx.Response(200, json=[])

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))

    # Run 1
    docs = ingest_github_repo(
        repo="psf/black",
        limit=10,
        client=client,
        db_path=db_path,
        raw_dir=tmp_path / "raw"
    )
    assert len(docs) == 2

    conn = get_db(db_path)
    count_docs_1 = conn.execute("SELECT count(*) as c FROM documents").fetchone()["c"]
    count_comments_1 = conn.execute("SELECT count(*) as c FROM comments").fetchone()["c"]
    conn.close()

    assert count_docs_1 == 2
    # Bot comments (dependabot) must be skipped:
    # Issue 101: body + 1 comment (gvanrossum) = 2
    # Issue 102: body = 1
    # Total = 3
    assert count_comments_1 == 3

    cursor_val = get_cursor("github", "psf/black", db_path=db_path)
    assert cursor_val is not None

    # Run 2: Test idempotency (no duplicates created)
    docs_2 = ingest_github_repo(
        repo="psf/black",
        limit=10,
        client=client,
        db_path=db_path,
        raw_dir=tmp_path / "raw"
    )
    conn = get_db(db_path)
    count_docs_2 = conn.execute("SELECT count(*) as c FROM documents").fetchone()["c"]
    count_comments_2 = conn.execute("SELECT count(*) as c FROM comments").fetchone()["c"]
    conn.close()

    assert count_docs_2 == count_docs_1
    assert count_comments_2 == count_comments_1


def test_discourse_ingest_offline_and_idempotency(tmp_path: Path):
    db_path = tmp_path / "test_disc.db"
    init_db(db_path)

    with open(FIXTURES_DIR / "discourse" / "topic_4700.json", "r", encoding="utf-8") as f:
        topic_fixture = json.load(f)
    with open(FIXTURES_DIR / "discourse" / "posts_batch.json", "r", encoding="utf-8") as f:
        batch_fixture = json.load(f)

    def mock_handler(request: httpx.Request):
        url = str(request.url)
        if "t/4700.json" in url:
            return httpx.Response(200, json=topic_fixture)
        elif "posts.json?post_ids[]=3" in url:
            return httpx.Response(200, json=batch_fixture)
        return httpx.Response(200, json={})

    client = httpx.Client(transport=httpx.MockTransport(mock_handler))

    # Run 1
    doc = ingest_discourse_topic(
        topic_url="https://discuss.python.org/t/pep-622-structural-pattern-matching/4700",
        client=client,
        db_path=db_path,
        raw_dir=tmp_path / "raw",
        sleep_sec=0
    )

    assert doc.thread_id == "discourse_4700"
    assert len(doc.comments) == 3

    conn = get_db(db_path)
    doc_count_1 = conn.execute("SELECT count(*) as c FROM documents WHERE thread_id = 'discourse_4700'").fetchone()["c"]
    comm_count_1 = conn.execute("SELECT count(*) as c FROM comments WHERE thread_id = 'discourse_4700'").fetchone()["c"]
    conn.close()

    assert doc_count_1 == 1
    assert comm_count_1 == 3

    # Run 2: Idempotency
    doc_2 = ingest_discourse_topic(
        topic_url="https://discuss.python.org/t/4700",
        client=client,
        db_path=db_path,
        raw_dir=tmp_path / "raw",
        sleep_sec=0
    )

    conn = get_db(db_path)
    doc_count_2 = conn.execute("SELECT count(*) as c FROM documents WHERE thread_id = 'discourse_4700'").fetchone()["c"]
    comm_count_2 = conn.execute("SELECT count(*) as c FROM comments WHERE thread_id = 'discourse_4700'").fetchone()["c"]
    conn.close()

    assert doc_count_2 == 1
    assert comm_count_2 == 3

