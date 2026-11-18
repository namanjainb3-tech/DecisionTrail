# DecisionTrail — 6-Scene Live Demo Walkthrough

This script provides an exact, step-by-step execution protocol for evaluating and presenting DecisionTrail during hackathon judging and live demonstrations. The entire demonstration runs **100% offline** using preloaded fixtures and pre-warmed vector caches.

---

## Pre-Flight Checklist
Before starting the demo:
1. Ensure the demo cache is pre-warmed:
   ```powershell
   .venv\Scripts\python scripts/preload_demo_cache.py
   ```
2. Start the FastAPI backend:
   ```powershell
   .venv\Scripts\uvicorn api.main:app --port 8000
   ```
3. Start the Next.js frontend (in a separate terminal):
   ```powershell
   cd web
   npm run start # or npm run dev
   ```
4. Open your browser to `http://localhost:3000`.

---

## Scene 1: Blind Ingestion from Discourse (Public Discussion Only)
* **Goal**: Demonstrate ingesting discussion from public community threads without ever touching the formal PEP document text.
* **Actions**:
  1. Navigate to the **Decisions Catalog** (`/decisions`).
  2. Explain: *"Open-source teams make crucial decisions in forum threads, but the formal RFC or PEP only records the final state. Here, DecisionTrail ingests public discussion from discuss.python.org topic #4589 for PEP 582."*
  3. Highlight the blind invariant: *"Notice that the actual PEP specification is never ingested—only community comments and developer debates are analyzed."*

---

## Scene 2: Decision Extraction & 100% Verifiable Citations
* **Goal**: Show that every extracted decision and rejected alternative is backed by a verbatim, machine-verified quote.
* **Actions**:
  1. In `/decisions`, click on **"Reject PEP 582 __pypackages__ directory specification"**.
  2. The inspector drawer on the right reveals:
     * **Outcome**: `REJECTED` (with confidence `99%`).
     * **Primary Decision Quote**:
       > *"The Steering Council has decided to reject PEP 582. The potential security and tooling complications outweigh the convenience."*
       > — `@brettcannon` (RapidFuzz $\ge 95\%$ Verified).
     * **Rejected Alternative**:
       > *"Enable __pypackages__ only when explicit flag is passed to Python CLI"*
       > **Why Rejected**: *"Defeats the primary ergonomics purpose of making virtualenv management invisible for beginners."*
       > **Verified Quote**: *"An opt-in flag requires users to remember command flags..."* — `@pradyunsg`.
  3. Emphasize: *"Notice the 'RapidFuzz $\ge 95\%$ Verified' badge. If an open-weight model hallucinates a quote, DecisionTrail's verification filter detects it and immediately discards it."*

---

## Scene 3: Blind PEP Evaluation Benchmark Dashboard
* **Goal**: Prove that DecisionTrail recovers over 50% of PEP "Rejected Ideas" blind from discussion alone.
* **Actions**:
  1. Click **Evaluation Benchmark** in the navigation bar (`/eval`).
  2. Point out the KPI summary cards:
     * **Overall Recall**: `63.6%` (exceeding the $50\%$ target).
     * **Precision Lower Bound**: `66.7%`.
     * **Ground Truth Ideas vs Recovered**: 14 of 22 ideas successfully recovered across 8 PEPs.
  3. Expand the **PEP 582** accordion:
     * Show the side-by-side comparison between the official PEP "Rejected Ideas" section and the extracted discussion alternative.
     * Highlight the **Cosine Similarity ($88.4\%$)** and the automated **LLM Judge Rationale**:
       *"Both proposals discuss gating __pypackages__ discovery behind a CLI argument and reject it due to ergonomics."*

---

## Scene 4: Knowledge Graph & File Rename Exploration
* **Goal**: Visualize the interconnected graph of Decisions, Files, Authors, and Sources, including rename resilience.
* **Actions**:
  1. Navigate to the **Knowledge Graph** (`/graph`).
  2. Observe the color-coded interactive visualization:
     * Green/Red nodes: Architectural Decisions.
     * Blue nodes: Repository Files.
     * Purple nodes: Contributors.
     * Amber nodes: Source Discussion Threads.
  3. Click on the node `crates/uv-resolver/src/lib.rs`.
  4. Click **"Focus Neighborhood (Depth 2)"**.
  5. Explain: *"When files are renamed or moved in a refactoring PR, DecisionTrail constructs `RENAMED_TO*` edges. When querying the current file path, the graph resolves all historical paths transitively so past decisions are never lost."*

---

## Scene 5: PR Simulator (Surfacing Decisions to Developers)
* **Goal**: Demonstrate how DecisionTrail alerts developers before they inadvertently resurrect a rejected design.
* **Actions**:
  1. Navigate to the **PR Simulator** (`/pr`).
  2. Click the preset button **`uv-resolver`**.
     * Target Repository: `astral-sh/uv`
     * Changed Files: `crates/uv-resolver/src/lib.rs`
     * PR Title: *"Attempting to use external SAT solver bindings"*
     * PR Diff Summary: *"Proposing libsolv integration instead of native Rust PubGrub implementation."*
  3. Click **"Analyze Pull Request"**.
  4. The bot comment generates instantly on the right:
     * Alerts the author: *"Prior decision: Implement standalone PubGrub resolver in Rust."*
     * Warns against the rejected alternative: *"Use libsolv SAT solver bindings — Rejected because SAT solvers lack version constraint backtrack explanations."*
     * Surfaces the exact quote from `@konstin`: *"While libsolv is fast, diagnosing why a dependency resolution failed is painful without PubGrub's error derivation graph."*
  5. Show the footer: *"Generated by DecisionTrail from public discussions. 100% verified verbatim quotes."*

---

## Scene 6: Maintainer Feedback Memory & Ranking Adjustment
* **Goal**: Show that maintainer feedback changes bot ranking and adapts over time.
* **Actions**:
  1. In the PR Simulator below the generated comment, click **"👎 Not Relevant (-1.0)"**.
  2. The UI confirms: *"Feedback recorded: not_relevant. DecisionTrail memory updated!"*
  3. Explain: *"DecisionTrail integrates feedback memory (backed by mem0 and persistent SQLite storage). When a maintainer marks a past decision as irrelevant to a file path, its ranking score drops by 1.0 or is suppressed entirely in subsequent PR analyses."*
  4. Re-click **"Analyze Pull Request"** with a different threshold to show the decision is suppressed or down-ranked, proving memory persistence!
