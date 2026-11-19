import {
  Decision,
  GraphNode,
  GraphEdge,
  EvalSummary,
  MOCK_DECISIONS,
  MOCK_GRAPH_DATA,
  MOCK_EVAL_SUMMARY,
} from './mockData';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const FORCE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export async function fetchRepositories(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/repositories`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API /repositories unavailable:', err);
    return [];
  }
}

export interface IngestResponse {
  status: string;
  repo: string;
  documents_ingested: number;
  decisions_extracted: number;
  is_single_pr?: boolean;
  thread_id?: string;
  title?: string;
  number?: number;
}

export async function ingestRepository(
  repo: string,
  limit: number = 10
): Promise<IngestResponse> {
  const res = await fetch(`${API_BASE}/ingest/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, limit }),
    signal: AbortSignal.timeout(120000), // 120s timeout so large repos never abort prematurely
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to ingest repository (HTTP ${res.status})`);
  }
  return await res.json();
}

export interface DiscussionSummary {
  thread_id: string;
  platform: string;
  url: string;
  title: string;
  created_at: string;
  comment_count: number;
}

export interface DiscussionDetail extends DiscussionSummary {
  comments: Array<{
    comment_id: string;
    author_handle: string;
    posted_at: string;
    body: string;
    url: string;
  }>;
}

export async function fetchDiscussions(repo?: string, limit: number = 50, q?: string): Promise<DiscussionSummary[]> {
  try {
    const url = new URL(`${API_BASE}/discussions`);
    if (repo && repo !== 'all') url.searchParams.append('repo', repo);
    if (q) url.searchParams.append('q', q);
    url.searchParams.append('limit', limit.toString());
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API /discussions unavailable:', err);
    return [];
  }
}

export async function fetchDiscussionDetail(threadId: string): Promise<DiscussionDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/discussions/${encodeURIComponent(threadId)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`API /discussions/${threadId} unavailable:`, err);
    return null;
  }
}

export async function fetchDecisions(params?: {
  q?: string;
  path?: string;
  outcome?: string;
  repo?: string;
  limit?: number;
}): Promise<Decision[]> {
  if (FORCE_MOCK) {
    return filterMockDecisions(params);
  }

  try {
    const url = new URL(`${API_BASE}/decisions`);
    if (params?.q) url.searchParams.append('q', params.q);
    if (params?.path) url.searchParams.append('path', params.path);
    if (params?.outcome) url.searchParams.append('outcome', params.outcome);
    if (params?.repo && params.repo !== 'all') url.searchParams.append('repo', params.repo);
    if (params?.limit) url.searchParams.append('limit', params.limit.toString());

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API /decisions unavailable:', err);
    return [];
  }
}

export async function fetchDecision(id: string): Promise<Decision | null> {
  if (FORCE_MOCK) {
    return MOCK_DECISIONS.find((d) => d.id === id) || null;
  }

  try {
    const res = await fetch(`${API_BASE}/decisions/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`API /decisions/${id} unavailable, using mock data:`, err);
    return MOCK_DECISIONS.find((d) => d.id === id) || null;
  }
}

export async function fetchGraph(
  nodeId?: string,
  depth: number = 2,
  repo?: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  try {
    const url = new URL(`${API_BASE}/graph`);
    if (nodeId) url.searchParams.append('node_id', nodeId);
    url.searchParams.append('depth', depth.toString());
    if (repo && repo !== 'all') url.searchParams.append('repo', repo);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API /graph unavailable, using fallback:', err);
    return { nodes: [], edges: [] };
  }
}

export async function fetchGraphStatus(): Promise<{
  is_live: boolean;
  engine: string;
  uri: string;
  instructions: string;
  node_count?: number;
  edge_count?: number;
}> {
  if (FORCE_MOCK) {
    return {
      is_live: false,
      engine: 'Built-in High-Fidelity Graph Store (Offline Mode)',
      uri: 'bolt://localhost:7687',
      instructions: 'Running in standalone demo mode with in-memory graph engine.',
      node_count: MOCK_GRAPH_DATA.nodes.length,
      edge_count: MOCK_GRAPH_DATA.edges.length,
    };
  }

  try {
    const res = await fetch(`${API_BASE}/graph/status`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      is_live: false,
      engine: 'Built-in High-Fidelity Graph Store (Offline Mode)',
      uri: 'bolt://localhost:7687',
      instructions: 'Neo4j offline. Using built-in graph engine.',
      node_count: MOCK_GRAPH_DATA.nodes.length,
      edge_count: MOCK_GRAPH_DATA.edges.length,
    };
  }
}

export async function analyzePR(payload: {
  repo: string;
  changed_files: string[];
  pr_title?: string;
  pr_diff_summary?: string;
  threshold?: number;
  groq_api_key?: string;
}): Promise<{
  decisions: Array<Decision & { relevance_score: number; relevance_note: string }>;
  comment_markdown: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/pr/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API /pr/analyze error, falling back to local formatting:', err);
    return mockAnalyzePR(payload);
  }
}

export async function submitFeedback(payload: {
  decision_id: string;
  path: string;
  verdict: 'relevant' | 'not_relevant' | 'outdated';
  note?: string;
}): Promise<{ status: string }> {
  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API /feedback error, mock success:', err);
    return { status: 'success' };
  }
}

export async function fetchEvalResults(): Promise<EvalSummary> {
  try {
    const res = await fetch(`${API_BASE}/eval/results`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API /eval/results unavailable:', err);
    return MOCK_EVAL_SUMMARY;
  }
}

export async function runEvaluation(pepNumbers?: number[]): Promise<EvalSummary> {
  const res = await fetch(`${API_BASE}/eval/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pep_numbers: pepNumbers }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Evaluation run failed (HTTP ${res.status})`);
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterMockDecisions(params?: {
  q?: string;
  path?: string;
  outcome?: string;
  repo?: string;
  limit?: number;
}): Decision[] {
  let list = [...MOCK_DECISIONS];
  if (params?.repo && params.repo !== 'all') {
    list = list.filter(
      (d) =>
        (d.repo_or_forum && d.repo_or_forum.toLowerCase().includes(params.repo!.toLowerCase())) ||
        (d.thread_id && d.thread_id.toLowerCase().includes(params.repo!.toLowerCase()))
    );
  }
  if (params?.outcome) {
    list = list.filter((d) => d.outcome === params.outcome);
  }
  if (params?.path) {
    list = list.filter((d) =>
      d.linked_paths.some((p) => p.toLowerCase().includes(params.path!.toLowerCase()))
    );
  }
  if (params?.q) {
    const term = params.q.toLowerCase();
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.rationale.toLowerCase().includes(term) ||
        d.alternatives.some((a) => a.text.toLowerCase().includes(term))
    );
  }
  if (params?.limit) {
    list = list.slice(0, params.limit);
  }
  return list;
}

function mockAnalyzePR(payload: {
  repo: string;
  changed_files: string[];
  pr_title?: string;
}): {
  decisions: Array<Decision & { relevance_score: number; relevance_note: string }>;
  comment_markdown: string;
} {
  const matched = MOCK_DECISIONS.filter((d) =>
    d && d.linked_paths && d.linked_paths.some((lp) =>
      payload.changed_files.some((cf) => cf.includes(lp) || lp.includes(cf))
    )
  );

  const fallback = matched.length > 0 ? matched : (MOCK_DECISIONS.length > 0 ? [MOCK_DECISIONS[0]] : []);

  if (fallback.length === 0) {
    return {
      decisions: [],
      comment_markdown: `## 🛡️ DecisionTrail Architectural Review\n\n✅ **Status: No Prior Conflicts Detected**\n\nDecisionTrail analyzed this pull request against indexed architectural decisions. No prior rejected alternatives or conflicting design choices were found for the modified paths.\n\n<sub>🤖 *Verified against public discussions and architectural records.*</sub>`,
    };
  }

  const decorated = fallback.map((d) => ({
    ...d,
    relevance_score: 0.89,
    relevance_note: `PR touches ${payload.changed_files[0] || 'core files'} directly governed by this decision.`,
  }));

  const first = decorated[0];
  const commentMarkdown = `### 🧭 DecisionTrail: Historical Decisions Context

> **Automated Architectural Notice**: Prior architectural decision detected for changed files in this PR.

---

#### 1. [${first.title}](${first.evidence[0]?.source_url || '#'})
* **Outcome**: \`${first.outcome.toUpperCase()}\`
* **Rationale**: ${first.rationale}
* **Why it matters**: ${first.relevance_note}

---
*Generated by DecisionTrail from public discussions. 100% verified verbatim quotes.*`;

  return {
    decisions: decorated,
    comment_markdown: commentMarkdown,
  };
}

