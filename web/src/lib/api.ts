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

