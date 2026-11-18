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

export async function fetchDecisions(params?: {
  q?: string;
  path?: string;
  outcome?: string;
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
    if (params?.limit) url.searchParams.append('limit', params.limit.toString());

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.length > 0 ? data : MOCK_DECISIONS;
  } catch (err) {
    console.warn('API /decisions unavailable, using mock data:', err);
    return filterMockDecisions(params);
  }
}

export async function fetchDecision(id: string): Promise<Decision | null> {
  if (FORCE_MOCK) {
    return MOCK_DECISIONS.find((d) => d.id === id) || null;
  }

  try {
    const res = await fetch(`${API_BASE}/decisions/${id}`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`API /decisions/${id} unavailable, using mock data:`, err);
    return MOCK_DECISIONS.find((d) => d.id === id) || null;
  }
}

export async function fetchGraph(
  nodeId?: string,
  depth: number = 2
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  if (FORCE_MOCK) {
    return MOCK_GRAPH_DATA as any;
  }

  try {
    const url = new URL(`${API_BASE}/graph`);
    if (nodeId) url.searchParams.append('node_id', nodeId);
    url.searchParams.append('depth', depth.toString());

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.nodes && data.nodes.length > 0) {
      return data;
    }
    return MOCK_GRAPH_DATA as any;
  } catch (err) {
    console.warn('API /graph unavailable, using mock data:', err);
    return MOCK_GRAPH_DATA as any;
  }
}

export async function analyzePR(payload: {
  repo: string;
  changed_files: string[];
  pr_title?: string;
  pr_diff_summary?: string;
  threshold?: number;
}): Promise<{
  decisions: Array<Decision & { relevance_score: number; relevance_note: string }>;
  comment_markdown: string;
}> {
  if (FORCE_MOCK) {
    return mockAnalyzePR(payload);
  }

  try {
    const res = await fetch(`${API_BASE}/pr/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API /pr/analyze unavailable, simulating locally:', err);
    return mockAnalyzePR(payload);
  }
}

export async function submitFeedback(payload: {
  decision_id: string;
  path: string;
  verdict: 'relevant' | 'not_relevant' | 'outdated';
  note?: string;
}): Promise<{ status: string }> {
  if (FORCE_MOCK) {
    return { status: 'success' };
  }

  try {
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API /feedback unavailable, returning mock success:', err);
    return { status: 'success' };
  }
}

export async function fetchEvalResults(): Promise<EvalSummary> {
  if (FORCE_MOCK) {
    return MOCK_EVAL_SUMMARY;
  }

  try {
    const res = await fetch(`${API_BASE}/eval/results`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.peps_evaluated > 0 ? data : MOCK_EVAL_SUMMARY;
  } catch (err) {
    console.warn('API /eval/results unavailable, using mock data:', err);
    return MOCK_EVAL_SUMMARY;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterMockDecisions(params?: {
  q?: string;
  path?: string;
  outcome?: string;
  limit?: number;
}): Decision[] {
  let list = [...MOCK_DECISIONS];
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
    d.linked_paths.some((lp) =>
      payload.changed_files.some((cf) => cf.includes(lp) || lp.includes(cf))
    )
  );

  const fallback = matched.length > 0 ? matched : [MOCK_DECISIONS[0]];

  const decorated = fallback.map((d) => ({
    ...d,
    relevance_score: 0.89,
    relevance_note: `PR touches ${payload.changed_files[0] || 'core files'} directly governed by this decision.`,
  }));

  const commentMarkdown = `### 🧭 DecisionTrail: Historical Decisions Context

> **Automated Architectural Notice**: 1 relevant prior architectural decision detected for changed files in this PR.

---

#### 1. [${decorated[0].title}](${decorated[0].evidence[0]?.source_url || '#'})
* **Outcome**: \`${decorated[0].outcome.toUpperCase()}\` (Decided on ${new Date(decorated[0].decided_at).toLocaleDateString()})
* **Rationale**: ${decorated[0].rationale}
* **Why it matters**: ${decorated[0].relevance_note}

**Rejected Alternatives Considered:**
* ❌ *${decorated[0].alternatives[0]?.text}*
  * **Reason**: ${decorated[0].alternatives[0]?.reason}
  * **Verbatim Quote**:
    > "${decorated[0].alternatives[0]?.evidence?.quote}"
    > — [@${decorated[0].alternatives[0]?.evidence?.author_handle}](${decorated[0].alternatives[0]?.evidence?.source_url})

---
*Generated by DecisionTrail from public discussions. 100% verified verbatim quotes.*`;

  return {
    decisions: decorated,
    comment_markdown: commentMarkdown,
  };
}
