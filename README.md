# DecisionTrail

> **Why was it done this way?**  
> Recovering architectural, design, and technical decisions from public open-source discussions with **100% verifiable source citations**.

[![Test Suite](https://img.shields.io/badge/pytest-44%20passed-brightgreen.svg)](tests/)
[![Quote Verification](https://img.shields.io/badge/RapidFuzz-%E2%89%A595%25%20Verified-blue.svg)](extract/verify.py)
[![Blind PEP Recall](https://img.shields.io/badge/Blind%20Recall-63.6%25-success.svg)](docs/eval_results.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-lightgrey.svg)](LICENSE)

---

## 1. What DecisionTrail Does That ADRs, PEPs, and RFCs Do Not

Architecture Decision Records (ADRs), PEPs, and RFCs capture major, formal milestones. But **90% of real engineering decisions are never formally written down**. They live scattered in closed GitHub issues, abandoned PRs, review comment threads, and developer forums:
* *"Why did we choose custom PubGrub in Rust instead of wrapping pip's resolvelib?"*
* *"Why did we revert that Windows site-packages symlink patch in 2024?"*
* *"Was an opt-in CLI flag considered before rejecting PEP 582 `__pypackages__`?"*

Traditional tools require developers to manually author ADRs—a practice that quickly suffers from documentation rot. **DecisionTrail automatically recovers unwritten decisions and rejected alternatives directly from public discourse**, maps them to codebase files through refactoring renames, and warns engineers on incoming Pull Requests *before* they resurrect a discarded idea.

---

## 2. Non-Negotiable Principle: 100% Verifiable Source Traceability

Small and open-weight models frequently hallucinate convincing rationales. DecisionTrail enforces an absolute anti-hallucination guarantee:

$$\text{RapidFuzz.partial\_ratio}(\text{normalize}(Quote), \text{normalize}(CommentBody)) \ge 95\%$$

* **Zero Tolerance for Fake Citations**: Every extracted decision and rejected alternative must carry an exact verbatim quote, author handle, ISO timestamp, and direct discussion URL.
* If a model alters or hallucinates a single quote, that alternative or decision is **immediately discarded**.
* Maintainers can click directly to the source human comment with a single click.

---

## 3. Open-Weight Models & Free-Tier Architecture

In strict compliance with the hackathon requirements, DecisionTrail is engineered entirely for open-weight models and local execution:
* **Primary LLM**: Groq `openai/gpt-oss-20b` (low-temperature JSON structured extraction).
* **Fallback LLM**: OpenRouter `meta-llama/llama-3.1-8b-instruct`.
* **Dense Embeddings**: Local `BAAI/bge-small-en-v1.5` / `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vectors running on CPU).
* **Fuzzy Alignment**: `rapidfuzz` C++ accelerated string matcher.
* **Disk Caching**: All HTTP API responses and LLM completions are saved in `data/raw/` and `data/raw/llm_cache/`, guaranteeing **100% offline, air-gapped demo execution**.

---

## 4. Key Performance Metrics & Benchmark Results

DecisionTrail was evaluated against the Python Software Foundation PEP archive using a **strict blind benchmark**:
* **Blind Invariant**: The database contains **zero** PEP specification documents (`SELECT count(*) FROM documents WHERE platform = 'pep' == 0`). Decisions were extracted strictly from public discussion topics on `discuss.python.org`.
* **Two-Stage Matcher**: Cosine similarity $\ge 0.60$ + LLM judge validation.

| Metric | Result | Target Benchmark |
| :--- | :---: | :---: |
| **Overall Blind Recall** | **63.6%** | $\ge 50.0\%$ |
| **Precision (Lower Bound)** | **66.7%** | Honest qualitative lower bound |
| **PEPs Evaluated** | **8 PEPs** | 8–10 PEP benchmark |
| **Verbatim Quote Accuracy** | **100%** | $\ge 95\%$ RapidFuzz threshold |
| **Total Test Suite** | **44 Passing Tests** | 100% passing across all modules |

*Full evaluation report available at [docs/eval_results.md](docs/eval_results.md).*

---

## 5. System Architecture

```text
DecisionTrail/
├── api/                    # FastAPI REST service (/health, /decisions, /graph, /pr/analyze, /eval/results)
├── bot/                    # PR analysis engine, Markdown comment generator, and Action workflow
├── core/                   # Frozen Pydantic models, SQLite + FTS5, Neo4j, and LLM clients
├── data/                   # SQLite database (decisiontrail.db), eval.db, and raw cached fixtures
├── docs/                   # Architecture spec, design trade-offs, extraction audit, and demo script
├── eval/                   # Blind PEP evaluation suite with two-stage embedding + LLM judge
├── extract/                # Windowed chunking, decision cues filter, and RapidFuzz quote verifier
├── graph/                  # Neo4j knowledge graph loader & rename-resilient code linker
├── ingest/                 # Public GitHub REST & Discourse JSON connectors, SHA-256 identity resolver
├── memory/                 # Maintainer feedback memory (mem0 + SQLite fallback)
├── retrieve/               # Hybrid search: Graph Proximity + SQLite FTS5 BM25 + Vector Cosine RRF
├── scripts/                # preload_demo_cache.py for 100% offline demo execution
├── tests/                  # 44 offline unit and integration tests
└── web/                    # Next.js interactive web dashboard with Tailwind CSS
```

---

## 6. Answers to the 4 Judging Questions

For comprehensive answers to the judging criteria, please see [docs/tradeoffs.md](docs/tradeoffs.md):

1. **Same Person Across Platforms**: Normalized handles, SHA-256 email digests, and exact display name matching. Conservative by design to prevent false identity mergers.
2. **Incremental Updates**: Per-source `updated_at` cursors, `ON CONFLICT` upserts, and decision cues heuristic regex gating. Never reprocesses unchanged threads.
3. **Links Surviving File Renames**: Transitive ancestor path resolution over `(:File)-[:RENAMED_TO*]->(:File)` edges built from PR file diffs. Revert PRs automatically flip decision outcomes.
4. **Showing Sources**: Every proposal pairs with an exact verbatim quote verified with $\ge 95\%$ RapidFuzz match against the source text. Direct URLs link to the human conversation.

---

## 7. Quickstart Guide

### Prerequisites
* Python 3.11+
* Node.js 18+ & npm

### Setup
```powershell
# 1. Setup Python virtual environment
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. Pre-warm offline demo cache
python scripts/preload_demo_cache.py

# 3. Run full automated test suite (44 tests)
pytest tests/
```

### Running the Services
```powershell
# Start FastAPI backend (Terminal 1)
uvicorn api.main:app --port 8000

# Start Next.js frontend (Terminal 2)
cd web
npm install
npm run dev # or npm run build && npm run start
```
Visit `http://localhost:3000` to explore the **Decisions Catalog**, **Knowledge Graph**, **PR Simulator**, and **Evaluation Benchmark**.

---

## 8. Safety & Compliance Ground Rules

* **Zero Web Scraping**: All data is ingested via official public GitHub REST APIs and public Discourse JSON endpoints. No headless browsers or proxy networks are used.
* **Strict PR Bot Allowlist**: `bot/analyze.py` enforces a hardcoded `ALLOWED_POST_REPOS` security guard. Automated posting will never target production repositories.
* **Synthetic Test Disclosure**: Small-scale test suites (`tests/test_code_linker.py`, `tests/test_extract.py`) use explicitly synthetic, hand-authored test fixtures to guarantee fast, deterministic, and air-gapped test runs without external API dependencies.
