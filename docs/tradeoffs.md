# DecisionTrail — Architectural Trade-offs & Design Question Answers

This document provides technical answers to the four core design challenges outlined in Section 10 of the Product Requirements Document (PRD).

---

## 1. Cross-Platform Contributor Identity Resolution

### Question:
*How do you determine that a user commenting on GitHub is the same contributor posting on Discourse or Discord, without violating user privacy or hallucinating false identity mergers?*

### DecisionTrail Implementation:
Identity resolution is handled by `ingest/identity.py` and the `aliases` table in SQLite:

1. **Conservative Deterministic Linking**:
   * Handle normalization: All platform usernames are case-folded and stripped of surrounding whitespace.
   * SHA-256 Email Hashing: When commit metadata or platform payloads contain email addresses, DecisionTrail hashes them with `hashlib.sha256(email.strip().lower().encode()).hexdigest()`. We never store raw email addresses in the application store.
   * Exact Display Name Matching: If a user has the exact same display name (e.g., "Charlie Marsh") across GitHub and Discourse, they are mapped to the same `canonical_person_id`.
2. **Explicit Conservatism Over False Positives**:
   * We do not use fuzzy string matching or LLM inference to guess that two handles might be the same person.
   * If `charlie` on GitHub cannot be deterministically proven to be `cmarsh` on Discourse via email hash or matching display name, they are preserved as distinct `Person` nodes.
   * **Trade-off Justification**: In architectural decision auditing, attributing an opinion or decision to the wrong developer is far more damaging than maintaining two separate aliases for the same individual.

---

## 2. Incremental Ingestion Without Redundant Reprocessing

### Question:
*Open-source projects generate tens of thousands of comments. How do you handle continuous updates without re-running LLM extraction over the entire historical archive on every run?*

### DecisionTrail Implementation:
Incremental updates are guaranteed across all ingestion and extraction layers:

1. **Per-Source Timestamp Cursors (`ingest_cursors` table)**:
   * Every source (e.g., `github_astral-sh/uv`, `discourse_discuss.python.org_4589`) stores its high-water mark timestamp (`last_updated_at`) in the SQLite database.
   * On subsequent invocations, API queries filter strictly for `since=cursor.last_updated_at`.
2. **Idempotent Storage Upserts**:
   * Comments are inserted with `ON CONFLICT(comment_id) DO UPDATE SET ...` ensuring that edited comments are updated without duplicating rows or breaking referential integrity.
   * The SQLite FTS5 index (`comments_fts`) is updated incrementally by deleting old tokens for the specific `comment_id` and re-indexing the modified body.
3. **Chunk-Level Heuristic Gating**:
   * Even when new comments are ingested, `extract/filter.py` applies a regex filter scanning for decision cues ("we decided", "instead of", "rejected", "reverted", "closing because").
   * Only the comment windows containing decision cues are forwarded to the LLM extractor. Unrelated conversational chatter or CI status comments are discarded before spending LLM tokens.
4. **Idempotent Knowledge Graph Merges**:
   * All Neo4j Cypher queries utilize `MERGE (d:Decision {id: $id})` and `MERGE (f:File {id: $id})`. Re-running the pipeline on existing data modifies existing properties without creating duplicate nodes or edges.

---

## 3. Decision Links Surviving File Moves and Renames

### Question:
*Architectural decisions affect code, but repositories undergo refactoring. How do decisions linked to `old_path.py` continue to surface when a PR modifies `new_path.py` years later?*

### DecisionTrail Implementation:
File rename resilience is implemented in `graph/code_linker.py` via transitive rename graphs:

1. **Stable File Node Identity**:
   * Every file is assigned a canonical `file_id`. When a GitHub Pull Request records a file move (`previous_filename`), DecisionTrail generates a `(:File {path: old})-[:RENAMED_TO {pr_number: n}]->(:File {path: new})` relationship.
2. **Transitive Path Resolution**:
   * When querying decisions for a current path $P$, DecisionTrail computes the transitive ancestor path closure:
     $$\text{Ancestors}(P) = \{ p_0 \mid p_0 \xrightarrow{\text{RENAMED\_TO}^*} P \}$$
   * Cypher query:
     ```cypher
     MATCH (old:File)-[:RENAMED_TO*0..5]->(current:File {path: $path})
     MATCH (d:Decision)-[:AFFECTS]->(old)
     RETURN DISTINCT d
     ```
   * An identical recursive traversal is implemented in the offline Python mock graph store.
3. **Revert Override Detection**:
   * If a merged PR title begins with `"Revert "`, DecisionTrail matches the original PR and automatically flips the decision's outcome to `reverted`, preventing discarded implementations from being presented as active architectural guidance.

---

## 4. 100% Verifiable Source Traceability (Anti-Hallucination)

### Question:
*Small and open-weight LLMs frequently fabricate plausible-sounding rationales and hallucinate quotes. How does DecisionTrail guarantee that maintainers can trust every surfaced citation?*

### DecisionTrail Implementation:
DecisionTrail treats LLM outputs as untrusted proposals subject to automated cryptographic-style string verification:

1. **Mandatory Verbatim Quote Extraction**:
   * The extraction prompt (`extract/prompts.py`) strictly forbids summarizing or paraphrasing:
     *"Extract only what is explicitly stated in the comments. You MUST quote the exact sentence verbatim from the comment text. If no exact quote exists, return an empty list."*
2. **RapidFuzz Machine Verification (`extract/verify.py`)**:
   * For every quote in `evidence` or `rejected_alternatives`, the system normalizes whitespace and punctuation, then computes:
     $$\text{Score} = \text{RapidFuzz.partial\_ratio}(\text{normalize}(Q), \text{normalize}(\text{CommentBody}))$$
   * **Strict Cutoff**: If $\text{Score} < 95\%$, the quote is declared an LLM fabrication.
   * If an alternative's quote fails verification, that alternative is stripped.
   * If a decision has zero verified quotes remaining in its evidence array, the **entire decision is discarded**.
3. **Direct User Verification**:
   * Every rendered comment and UI card includes the exact quote, author handle, ISO timestamp, and a direct URL linking to the original discussion comment or forum post.
   * Maintainers never have to take the model's word for it; they can click directly to the human conversation that made the call.

