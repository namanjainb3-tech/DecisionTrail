You are implementing Phase N of DecisionTrail. Read the core context (Sections 1 to 6) and Phase N below. Only create or edit the files listed for Phase N. Use the models in core/models.py exactly as defined. Do not change other phases' code. Write the tests listed under acceptance checks and run them. If anything is ambiguous, state your assumption in a comment and continue. Stop when all acceptance checks pass and summarize what you built.
1. Product summary
New contributors keep asking "why was it done this way?" The answer is buried in old issue threads, PR reviews and forum posts. DecisionTrail reads a project's public discussions, extracts decisions (what was decided, which alternatives were rejected, and why), links each decision to the code it affects, and when someone opens a PR touching that code, a bot comments with the relevant past decisions and links to the original discussion.
Example bot comment: "This approach was tried in 2022 and reverted. Reason: it broke Windows path handling. Source: link."
Non-negotiable principle: every claim is verifiable. Each decision and each rejected alternative must carry a verbatim quote from a source, with its URL, author and date. If the quote is not found in the source text, the extraction is discarded. This is our defense against small-model hallucination and the answer to the design question "how do maintainers check instead of trust."
2. Goals and non-goals
Goals
• Ingest GitHub issues, PRs and review comments from one repository, plus Discourse threads from discuss.python.org (multi-source).
• Extract structured decisions with rejected alternatives and reasons, using open-weight models on free API tiers.
• Store decisions in a Neo4j knowledge graph linked to sources, people and files.
• Blind evaluation: feed discussion threads of PEPs without the PEP text and measure recall of the PEP's "Rejected Ideas".
• PR bot that surfaces relevant past decisions for changed files, with citations.
• mem0-based memory so the bot remembers maintainer feedback.
• A small web UI: browse decisions, graph view, PR simulator, evaluation dashboard.
Non-goals (cut these first, never the reverse)
• Mailing list ingestion.
• Full cross-platform identity resolution (we do a simple alias table).
• Symbol-level (function-level) code linking. File-level only.
• Real-time webhooks at scale, authentication, multi-tenancy.
• Training or fine-tuning any model.
3. Success metrics
Metric
Target
Blind PEP recall (rejected alternatives recovered, judged match)
Report a real number on 8 to 10 PEPs. Aim for 50% or higher.
Source traceability
100% of stored decisions have a verified verbatim quote and URL
PR bot
On a real code change in the target repo (replayed in our fork), surfaces at least one genuinely relevant past decision with a link
Precision on bot output
Hand-check 20 surfaced decisions, report how many are relevant
Demo reliability
Runs fully from cached data with no live API dependency
4. Demo script (what we are building toward)
1.  Show a PEP discussion thread going in, with the PEP text excluded.
2.  Run extraction. Show decisions and rejected alternatives appearing, each with its source quote.
3.  Show the evaluation dashboard: recall per PEP and overall.
4.  Open the graph view. Click a decision, see the source thread, the people involved and the files affected.
5.  In the PR simulator, replay a historical PR on the target repo. The bot comments with a past decision and link.
6.  Give feedback "not relevant" on one result, re-run, and show the bot remembered (mem0).
5. Architecture and repository layout
decisiontrail/
  core/            # shared: models, config, db clients, llm client, logging
    models.py
    config.py
    llm.py
    db_sqlite.py
    db_neo4j.py
  ingest/          # source connectors, no LLM here
    github_ingest.py
    discourse_ingest.py
    identity.py
  extract/         # decision extraction pipeline
    chunking.py
    filter.py
    extractor.py
    verify.py
    prompts.py
  graph/           # writing decisions to Neo4j, code linking
    loader.py
    code_linker.py
  retrieve/        # retrieval for PRs
    embeddings.py
    search.py
    rerank.py
  memory/          # mem0 wrapper
    feedback_memory.py
  bot/             # PR analysis and comment rendering
    analyze.py
    render.py
    action/         # GitHub Action workflow for the test fork
  eval/            # blind PEP evaluation
    pep_loader.py
    matcher.py
    run_eval.py
  api/             # FastAPI app
    main.py
  web/             # Next.js frontend
  data/raw/        # cached API responses (gitignored)
  tests/
  docker-compose.yml
  README.md
Data flow: connectors write raw documents to SQLite, then chunking and filtering, then LLM extraction, then quote verification, then decisions saved in SQLite and loaded into Neo4j, then code linker adds file edges, then retrieval and the bot read from Neo4j plus the vector index.
Storage split (keep this simple)
• SQLite (with FTS5 for BM25 keyword search): raw documents, comments, chunks, alias table, evaluation results, ingestion cursors. This is the system of record.
• Neo4j 5.x (Docker): the knowledge graph and a vector index on Decision embeddings. Rebuildable from SQLite at any time.
6. Technical stack, configuration and data contracts
Stack
• Python 3.12, FastAPI, Pydantic v2, httpx, SQLite, neo4j driver, sentence-transformers (BAAI/bge-small-en-v1.5), mem0ai, rapidfuzz, pytest.
• LLM: open-weight via OpenAI-compatible endpoints. Primary: Groq with openai/gpt-oss-20b. Fallback: OpenRouter with a free Llama 3.1 8B variant. One llm.py wrapper with a complete_json(prompt, schema) function, retries, JSON repair and on-disk response caching keyed by prompt hash.
• Frontend: Next.js, Tailwind, react-force-graph-2d.
• Infra: Docker Compose for Neo4j only.
Environment variables (.env) GITHUB_TOKEN, GROQ_API_KEY, OPENROUTER_API_KEY, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, TARGET_REPO (default psf/black, configurable), LLM_PRIMARY_MODEL, LLM_FALLBACK_MODEL.
Pydantic models (core/models.py, created in Phase 0, treated as frozen)
class Evidence(BaseModel):
    source_url: str
    platform: Literal["github_issue","github_pr","github_review","discourse"]
    author_handle: str
    posted_at: datetime
    quote: str            # verbatim, must exist in source text

class RejectedAlternative(BaseModel):
    text: str             # what was proposed
    reason: str           # why it was rejected
    evidence: Evidence

class Decision(BaseModel):
    id: str               # sha1 of (thread_id + title)
    repo_or_forum: str
    thread_id: str
    title: str            # short, e.g. "Use pathlib instead of os.path"
    outcome: Literal["adopted","rejected","reverted","deferred"]
    rationale: str
    alternatives: list[RejectedAlternative]
    evidence: list[Evidence]   # at least one
    confidence: float          # 0 to 1, from extractor
    decided_at: datetime | None
    linked_paths: list[str] = []
    extractor_model: str

class Document(BaseModel):   # one thread (issue, PR or topic)
    thread_id: str
    platform: str
    url: str
    title: str
    created_at: datetime
    comments: list[Comment]

class Comment(BaseModel):
    comment_id: str
    author_handle: str
    author_email: str | None
    posted_at: datetime
    body: str
    url: str
Neo4j schema (graph/loader.py)
Nodes: Decision, Alternative, Source (a specific comment/post), Person, Alias, File, PR.
Relationships:
• (Decision)-[:HAS_ALTERNATIVE]->(Alternative)
• (Decision)-[:SUPPORTED_BY]->(Source) and (Alternative)-[:SUPPORTED_BY]->(Source)
• (Decision)-[:AFFECTS]->(File)
• (Decision)-[:FROM_PR]->(PR)
• (Person)-[:AUTHORED]->(Source)
• (Alias)-[:ALIAS_OF]->(Person)
• (File)-[:RENAMED_TO]->(File)
Constraints: unique id on Decision, Source (by URL), File (by stable file_id). Vector index decision_embedding_idx (384 dims, cosine) on Decision.embedding.
API surface (FastAPI)
Endpoint
Purpose
GET /health
liveness
POST /ingest/github
body: repo, limit, since
POST /ingest/discourse
body: topic_url
POST /extract/run
body: optional thread_ids
GET /decisions
filters: q, path, outcome
GET /decisions/{id}
full decision with evidence
GET /graph
nodes and edges around a decision or file
POST /pr/analyze
body: repo, pr_number or changed_files plus title
POST /feedback
body: decision_id, path, verdict (relevant, not_relevant, outdated)
POST /eval/run
body: pep_numbers
GET /eval/results
per-PEP and overall recall
7. Phased build plan
Each phase lists its goal, files, details, and acceptance checks. Time estimates assume three people working in parallel where noted.
Phase 0: Scaffold and contracts (hour 0 to 1)
Goal: a runnable skeleton with frozen data contracts.
Files: repo root files, core/*, docker-compose.yml, .env.example, .gitignore, tests/test_models.py, README.md stub.
Details
• Create the folder layout from Section 5 with empty modules.
• Implement core/models.py exactly as in Section 6.
• core/config.py loads env vars with Pydantic Settings.
• core/db_sqlite.py: create tables documents, comments, chunks, aliases, ingest_cursors, decisions, eval_results, plus an FTS5 table over comment bodies.
• core/db_neo4j.py: connection helper and a function that creates the constraints and vector index.
• core/llm.py: complete_json() with caching in data/raw/llm_cache/.
• docker-compose.yml starts Neo4j with a volume.
• FastAPI GET /health only.
Acceptance checks: docker compose up brings Neo4j up; pytest tests/test_models.py passes (models validate and reject a Decision with empty evidence); uvicorn api.main:app serves /health; complete_json returns parsed JSON for a trivial prompt and a second call is served from cache.
Phase 1: Ingestion (hour 1 to 3, Person A or B)
Goal: public discussions from GitHub and Discourse are stored in SQLite as Document objects.
Files: ingest/github_ingest.py, ingest/discourse_ingest.py, ingest/identity.py, tests/test_ingest.py.
Details
• GitHub: use the REST API with the token. For TARGET_REPO, fetch closed issues and PRs, newest first, up to a configurable limit (default 300 threads). For each, fetch issue comments and, for PRs, review comments plus the file list from /pulls/{n}/files (store filename and previous_filename). Skip bot accounts. Store merged status and merge date.
• Discourse: given a discuss.python.org topic URL, fetch /t/{id}.json. The topic JSON includes the first posts and a post_stream.stream array of all post ids. Fetch the remaining posts in batches through /t/{id}/posts.json?post_ids[]=.... Strip HTML to plain text. Sleep one second between requests.
• Incremental updates: save updated_at per source in ingest_cursors. On re-run, request only items newer than the cursor and upsert by comment_id. This is our answer to "how do you update without reprocessing."
• Identity: identity.py normalizes handles (lowercase, strip), hashes emails with SHA-256 (never store raw emails for the hackathon dataset), and merges aliases when the same email hash or the same exact display name appears across platforms. Writes to the aliases table with a canonical person id.
• Every raw API response is cached on disk by URL.
Acceptance checks: ingesting 20 threads from the target repo and 3 Discourse topics produces rows in SQLite; running ingestion twice creates no duplicates; a test verifies HTML stripping and cursor behavior using saved fixtures (no network in tests).
Phase 2: Extraction pipeline (hour 2 to 5, Person A)
Goal: turn documents into verified Decision objects.
Files: extract/chunking.py, extract/filter.py, extract/prompts.py, extract/extractor.py, extract/verify.py, tests/test_extract.py.
Details
1.  Chunking: group a thread into windows of consecutive comments up to about 3,000 characters, always keeping comment boundaries and ids. Include the thread title as context in every chunk.
2.  Heuristic filter: keep only chunks that match decision cues (examples: "we decided", "instead of", "rejected", "won't", "reverted", "alternative", "downside", "I'd rather", "closing because", "not going to"). Record the filter hit rate. Cheap and prevents wasting LLM calls.
3.  LLM extraction: prompt the model with the chunk and require JSON that matches a reduced schema: list of {title, outcome, rationale, alternatives:[{text, reason, quote, comment_id}], quote, comment_id, confidence}. The prompt must say: only extract what is explicitly stated, quote verbatim, return an empty list if there is no real decision, and never infer reasons.
4.  Quote verification (verify.py): for each quote, check that it appears in the body of the named comment after whitespace normalization, with a small fuzzy tolerance (rapidfuzz partial ratio of 95 or higher). If the quote fails, drop that alternative or decision. If a decision has no verified evidence left, drop it entirely. Log drop counts.
5.  Merging: decisions from different chunks of the same thread with the same normalized title are merged, combining evidence and alternatives.
6.  Output: fully populated Decision objects saved in the SQLite decisions table.
Acceptance checks: unit tests with a hand-written fake LLM response confirm that a fabricated quote is dropped; run on 10 real threads and manually spot-check 10 decisions (record the result in docs/extraction_notes.md); every saved decision passes the model validator and has at least one verified evidence item.
Phase 3: Knowledge graph loading (hour 3 to 5, Person B, parallel with Phase 2 once models exist)
Goal: decisions, people, sources and files live in Neo4j.
Files: graph/loader.py, tests/test_graph.py.
Details
• load_decisions(decisions) upserts nodes and relationships per the schema in Section 6, using MERGE on stable ids so reruns are idempotent.
• Link Person nodes using the alias table.
• Store the Decision embedding (bge-small over title + rationale + alternatives) in the vector index. Embedding code lives in retrieve/embeddings.py, owned by Person B in this phase.
• Provide get_decision(id), neighborhood(id, depth=2) and rebuild_from_sqlite().
• Use a fixture JSON of 5 fake decisions so this phase does not depend on Phase 2 finishing.
Acceptance checks: loading the fixture twice yields the same node counts; a Cypher query returns a decision with its alternatives and source URLs; the vector index returns the expected decision for a paraphrased query.
Phase 4: Code linking and rename handling (hour 5 to 6, Person B)
Goal: each decision gets AFFECTS edges to files, and the links survive renames.
Files: graph/code_linker.py, tests/test_code_linker.py.
Details
• Primary link: if a decision's thread is a merged PR, its changed files (from Phase 1) become AFFECTS edges. If the thread is an issue, find PRs that reference it ("fixes #n", "closes #n", or cross-references stored in comments) and use those PRs' files. If a Discourse thread URL is mentioned in a PR or issue body, link through that PR.
• Reverts: if a PR title starts with "Revert", mark the linked decision outcome as reverted when the extractor did not already.
• Stable file identity: each file gets a file_id. When a PR's file list shows previous_filename, create a new File node and a RENAMED_TO edge from the old one. Lookup by any historic path resolves through RENAMED_TO* to the current file, so old decisions still surface after a move.
• Decisions with no code link remain browsable but are not surfaced by the bot.
Acceptance checks: test with a synthetic history where a.py is renamed to b.py: a decision linked to a.py is returned when querying b.py; a revert PR flips the outcome; decisions without PRs get zero AFFECTS edges.
Phase 5: Retrieval and PR bot (hour 6 to 8, Person B plus Person C)
Goal: given a PR, return and render the most relevant past decisions.
Files: retrieve/search.py, retrieve/rerank.py, bot/analyze.py, bot/render.py, bot/action/pr-comment.yml, tests/test_bot.py.
Details
• Input: repo, list of changed paths (with renames) and PR title or description.
• Candidate generation: (a) graph lookup of decisions with AFFECTS edges to the changed files after rename resolution, score weight 1.0 for exact file and 0.5 for same directory; (b) hybrid text search using the PR title and a short summary of the diff, combining SQLite FTS5 BM25 and vector similarity with reciprocal rank fusion.
• Merge and threshold: combine scores, drop anything below a tunable threshold, return at most 3 decisions. Showing nothing is better than showing noise.
• LLM relevance note (optional, small prompt): for each candidate, one sentence explaining why it is relevant to this PR, constrained to facts in the stored decision. If the model output cannot be parsed, fall back to a template sentence.
• Rendering: Markdown comment with, per decision: title, outcome, year, rationale, rejected alternatives with reasons, a verbatim quote, and links to the original discussion. Footer: "Generated from public discussions. Verify against the linked sources."
• Delivery: POST /pr/analyze returns the comment Markdown; the GitHub Action in bot/action/ posts it only on our own test fork. The code has a hard allowlist that refuses to post to any repo not in ALLOWED_POST_REPOS.
Acceptance checks: unit test with a seeded graph returns the expected decision for a PR touching its file; a PR touching unrelated files returns an empty list and no comment; the allowlist test confirms posting to a non-allowed repo raises an error.
Phase 6: mem0 feedback memory (hour 7 to 8, Person B)
Goal: the bot remembers maintainer feedback and changes behavior.
Files: memory/feedback_memory.py, tests/test_memory.py, edits to bot/analyze.py (ranking hook only).
Details
• Define an interface FeedbackMemory with record(decision_id, path, verdict, note) and adjustments(paths) -> dict[decision_id, float].
• Primary implementation uses mem0 configured with Neo4j as its graph store, local embeddings and the Groq LLM. Scope memories by repo and file path.
• Fallback implementation (same interface) stores verdicts in a SQLite table. If mem0 setup takes more than 30 minutes, switch to the fallback and move on.
• mem0 stores maintainer feedback and conversation context only. It is never the source of truth for decisions or quotes, because mem0 rewrites memories and would destroy verbatim evidence.
• Ranking hook: not_relevant lowers the score for that decision on that path, outdated hides it and adds a note, relevant boosts it. The rendered comment may add: "Previously marked relevant by a maintainer."
Acceptance checks: after recording not_relevant for decision X on path P, re-analysis of a PR touching P ranks X lower or drops it; memory persists after process restart.
Phase 7: Blind PEP evaluation (hour 5 to 8, Person A, starts once Phase 2 works)
Goal: a measured recall of rejected alternatives recovered blind.
Files: eval/pep_loader.py, eval/matcher.py, eval/run_eval.py, tests/test_eval.py, docs/eval_results.md.
Details
• Selecting PEPs: a script (not the LLM) reads PEP files from the python/peps repository, keeps those with a "Rejected Ideas" section and a discuss.python.org link in Post-History, and picks 8 to 10 with moderately sized threads. The script prints the chosen PEP numbers. Do not hard-code PEP numbers from memory.
• Answer key: parse each chosen PEP's "Rejected Ideas" section into a list of rejected items (one item per subheading or paragraph; a small LLM call may split paragraphs, and the result is saved and hand-reviewed for typos).
• Blind guarantee: the PEP text must never enter the ingestion database. run_eval.py asserts that no document with platform pep exists in the evaluation database, and uses a separate SQLite file for evaluation runs.
• Run: ingest only the linked Discourse threads, run the full extraction pipeline, collect predicted alternatives.
• Matching: an answer-key item counts as recovered if (a) embedding cosine similarity with any predicted alternative is at least 0.6 and (b) an LLM judge confirms they describe the same rejected idea (yes or no, with a one-line reason). Save the judge outputs.
• Metrics: per-PEP recall, overall recall, and precision (predicted alternatives judged to match any answer key item or any PEP text point). Report that precision is a lower bound because threads may contain valid rejections the PEP omitted.
• Write the results table to docs/eval_results.md and serve it from GET /eval/results.
Acceptance checks: the script runs end to end on 2 PEPs from cache; the blind assertion fires if a PEP document is inserted; results persist in eval_results.
Phase 8: Web UI (hour 3 to 9, Person C, in parallel from Phase 0)
Goal: a clean demo interface against the API.
Files: everything under web/.
Pages
• /decisions: searchable table (title, outcome badge, date, files, source count). Row opens a detail view showing rationale, each rejected alternative with reason, and each verbatim quote next to a link to its source.
• /graph: force-directed graph from GET /graph (decisions, sources, people, files; color by node type; click to open details).
• /pr: PR simulator. Inputs: repo and PR number, or pasted file paths plus title. Shows the rendered bot comment and a feedback button row (relevant, not relevant, outdated) calling POST /feedback.
• /eval: dashboard with per-PEP recall bars and an overall number, with expandable rows showing answer-key item versus matched prediction.
Details: build against mock JSON first, then switch to the real API. Dark theme, readable type, no login. Every decision card has a visible "View source" link.
Acceptance checks: each page renders with mock data; swapping in the real API requires only a base URL change; no page crashes on an empty database.
Phase 9: Hardening, demo and documentation (hour 8 to 10, everyone)
Files: README.md, docs/architecture.md, docs/tradeoffs.md, docs/demo_script.md, demo video.
Details
• Freeze features at hour 8. Fix only the worst extraction errors found during manual review.
• Pre-run the whole pipeline and cache everything so the demo works offline.
• Record a backup demo video.
• README states what the tool does that existing ADR/PEP/RFC tooling does not, shows the measured recall, notes any synthetic parts honestly, and documents that open-weight models are used.
• docs/tradeoffs.md answers the four design questions (Section 10).
• Rehearse the pitch twice.
8. Roles and timeline
Hours
Person A (extraction and eval)
Person B (graph, retrieval, memory)
Person C (UI, bot delivery, pitch)
0 to 1
Phase 0 together
Phase 0 together
Phase 0 together
1 to 3
Phase 1 ingestion
Phase 3 graph loader on fixtures
Phase 8 UI on mock data
3 to 5
Phase 2 extraction
Phase 3 vector index, embeddings
Phase 8 pages
5 to 6
Phase 7 eval start
Phase 4 code linking
Phase 8 graph and PR pages
6 to 8
Phase 7 eval finish
Phases 5 and 6
Phase 5 bot Action and rendering
8 to 10
Phase 9
Phase 9
Phase 9 and pitch
Use short-lived branches and PRs, reviewed by a teammate, for every phase.
9. Risks and mitigations
Risk
Mitigation
Small models hallucinate decisions
Verbatim quote verification; drop on failure; low-temperature JSON mode
Free API rate limits
Disk caching of every response; pre-run before demo; fallback model
Discourse or GitHub rate limits
Token auth, sleeps, incremental cursors, cached fixtures
mem0 setup eats time
30 minute cap, SQLite fallback behind the same interface
Eval number is low
Report honestly with examples; improve the filter cues and prompt; low recall with clear sourcing still beats an inflated claim
Scope creep
Section 2 non-goals; feature freeze at hour 8
Live demo failure
Offline cached run and recorded video
10. Answers to the design questions (for judges)
1.  Same person across platforms: an alias table normalizes handles, hashes emails, and merges on matching email hash or exact display name; we are explicit that this is conservative and misses some matches rather than falsely merging people.
2.  Incremental updates: per-source updated_at cursors, upserts by comment id, and idempotent graph MERGE, so new discussion only triggers extraction on new or changed threads.
3.  Links surviving renames: stable file_id nodes with RENAMED_TO edges built from PR file lists; lookups resolve historic paths to the current file.
4.  Showing sources: every decision and alternative stores a verbatim quote, URL, author and date; quotes are machine-verified against the source text, and the UI and bot comment always link to the original thread.
11. Ground rules checklist (from the problem statement)
• Public repository, work through pull requests, avoid direct pushes to main.
• Use only public sources; never post automated comments on real projects (allowlist enforced in code).
• State what this does that ADRs, PEPs, RFCs and KEPs do not: it recovers everyday decisions that were never formally written down.
• Use open-weight models (gpt-oss-20b, Llama 3.1 8B) on free tiers, and say so in the README.
• If any test is synthetic, say so explicitly in the README and demo.