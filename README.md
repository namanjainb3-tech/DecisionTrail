# DecisionTrail — Architectural Decision Intelligence for Git Repositories

> **Why was it done this way?**  
> Automatically recovering unrecorded engineering decisions, technical rationales, and rejected alternatives from Git discussions and code reviews with **100% verified verbatim source citations**.

[![Test Suite](https://img.shields.io/badge/pytest-45%20passed-brightgreen.svg)](tests/)
[![Quote Verification](https://img.shields.io/badge/RapidFuzz-%E2%89%A595%25%20Verified-blue.svg)](extract/verify.py)
[![Blind PEP Recall](https://img.shields.io/badge/Blind%20Recall-63.6%25-success.svg)](docs/eval_results.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-lightgrey.svg)](LICENSE)

---

## 1. The Problem & Our Solution

### The Problem: Unwritten Architecture & Institutional Memory Loss
Over **90% of architectural and technical trade-offs are never formally recorded** in Architecture Decision Records (ADRs), PEPs, or design docs. They live scattered across closed GitHub pull requests, issue threads, code review debates, and mailing lists:
* *"Why did we choose custom PubGrub in Rust instead of wrapping pip's resolvelib?"*
* *"Why did we revert that Windows site-packages symlink patch in 2024?"*
* *"Was an opt-in CLI flag considered before rejecting PEP 582 `__pypackages__`?"*

When maintainers leave or teams grow, institutional memory is lost. Engineers repeatedly propose previously rejected patterns, introduce breaking architectural regressions, or spend weeks re-litigating settled technical trade-offs.

### Our Solution: Automated Recovery & Active Guardrails
**DecisionTrail** continuously mines public developer discourse to reconstruct an immutable, queryable decision history:
1. **Intelligent Ingestion**: Ingests full discussion threads from GitHub PRs, Issues, and developer forums (Discourse) via official public REST APIs.
2. **Cues-Gated Extraction**: Pre-filters noise using decision-indicative regex heuristics and extracts decisions, outcomes (`adopted`, `rejected`, `reverted`, `deferred`), and rejected proposals using low-temperature structured open-weight LLMs.
3. **Verbatim Quote Verification**: Enforces a strict anti-hallucination guarantee using C++-accelerated fuzzy string matching ($\ge 95\%$ RapidFuzz partial ratio). Any hallucinated quote is immediately rejected.
4. **Rename-Resilient Knowledge Graph**: Links decisions to codebase files and maps them across historical git file renames (`(:File)-[:RENAMED_TO*]->(:File)`).
5. **PR Simulator Bot**: Evaluates incoming pull requests in CI, surfacing relevant past architectural precedents and alerting developers if their code resurrects a discarded proposal.

---

## 2. Key Features

* **100% Verifiable Source Traceability ($\ge 95\%$ RapidFuzz Matching)**:
  * Zero tolerance for LLM hallucinations. Every decision and rejected alternative is paired with an exact verbatim quote from a human maintainer, an author handle, an ISO timestamp, and a direct link to the original comment.
* **PR Review Simulator & CI Bot Guardrail**:
  * Simulates a GitHub Actions CI bot that inspects incoming PR titles, diffs, and descriptions. It flags conflicts with historical decisions and warns engineers *before* they merge architectural anti-patterns.
* **Interactive Knowledge Graph & Code Linker**:
  * Visualizes the web of relationships between repositories, architectural decisions, discussions, maintainers, and affected source files.
  * Preserves lineage across historical file renames and refactoring sweeps using transitive graph edge traversal.
* **Dynamic Multi-Repository Ingestion & Archive**:
  * Live-ingests any public GitHub repository or individual PR link on demand with immediate extraction.
  * Partitions data cleanly into an **Active Main Section** and an archived **Previous Data Section** with one-click repository activation and deletion.
* **Strict Blind Evaluation Benchmark (PEP Ground Truth)**:
  * Evaluated against Python Software Foundation discussions on `discuss.python.org`.
  * Guarantees a **Blindness Invariant**: zero PEP specification documents exist in the database (`platform = 'pep' == 0`), proving true blind extraction capability (achieved **63.6% recall** vs $\ge 50\%$ benchmark target).

---

## 3. System Architecture & Tech Stack

```text
DecisionTrail/
├── api/                    # FastAPI REST backend (/decisions, /discussions, /graph, /pr/analyze, /eval/run)
├── bot/                    # PR analysis engine, Markdown review generator, GitHub Action integration
├── core/                   # Frozen Pydantic models, SQLite + FTS5 full-text engine, Neo4j & fallback graph
├── data/                   # SQLite database (decisiontrail.db), eval.db, and raw offline cache fixtures
├── docs/                   # Architecture trade-offs, extraction audit, benchmark evaluation reports
├── eval/                   # Blind PEP evaluation suite with two-stage embedding + LLM judge
├── extract/                # Sliding window chunking, decision cues filter, RapidFuzz quote verifier
├── graph/                  # Neo4j knowledge graph loader & rename-resilient code linker
├── ingest/                 # Public GitHub REST & Discourse JSON connectors, SHA-256 identity resolver
├── memory/                 # Maintainer feedback memory (mem0 + SQLite fallback)
├── retrieve/               # Hybrid search: Graph Proximity + SQLite FTS5 BM25 + Vector Cosine RRF
├── scripts/                # preload_demo_cache.py for 100% offline, air-gapped demo execution
├── tests/                  # 45 offline unit and integration tests (100% pass rate)
└── web/                    # Next.js 14 web dashboard with Tailwind CSS & Vis-Network graph
```

### Technology Stack
* **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS (bespoke high-contrast obsidian design system, 1px structural borders, zero AI template tropes), Vis-Network for force-directed graph physics, custom SVGs.
* **Backend**: FastAPI, Python 3.11, Pydantic v2.
* **Storage & Retrieval**: SQLite 3 with FTS5 BM25 full-text indexing and WAL mode, Neo4j 5.x graph database (with an integrated pure-Python SQLite graph engine fallback).
* **AI & Extraction**: Groq `openai/gpt-oss-20b` (primary open-weight extraction) with OpenRouter `meta-llama/llama-3.1-8b-instruct` (fallback), local `sentence-transformers/all-MiniLM-L6-v2` / `BAAI/bge-small-en-v1.5` dense embeddings (384-dimensional on CPU).
* **Fuzzy Verification**: `rapidfuzz` C++ string alignment.

---

