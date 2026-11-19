export interface Evidence {
  source_url: string;
  platform: 'github_issue' | 'github_pr' | 'github_review' | 'discourse';
  author_handle: string;
  posted_at: string;
  quote: string;
}

export interface RejectedAlternative {
  text: string;
  reason: string;
  evidence: Evidence;
}

export interface Decision {
  id: string;
  repo_or_forum: string;
  thread_id: string;
  title: string;
  outcome: 'adopted' | 'rejected' | 'reverted' | 'deferred';
  rationale: string;
  alternatives: RejectedAlternative[];
  evidence: Evidence[];
  confidence: number;
  decided_at: string;
  linked_paths: string[];
  extractor_model: string;
}

export interface GraphNode {
  id: string;
  type: 'Decision' | 'File' | 'Person' | 'Source' | 'Repo' | 'Discussion' | 'Alternative' | string;
  label?: string;
  title?: string;
  path?: string;
  outcome?: string;
  name?: string;
  handle?: string;
  url?: string;
  quote?: string;
  repo_or_forum?: string;
  thread_id?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'AFFECTS' | 'AUTHORED_BY' | 'SOURCED_FROM' | 'RENAMED_TO' | 'DISCUSSED_IN' | 'BELONGS_TO' | 'IN_REPOSITORY' | 'SUPPORTED_BY' | 'AUTHORED' | 'HAS_ALTERNATIVE' | string;
}

export interface EvalResultItem {
  pep_number: number;
  title: string;
  ground_truth_count: number;
  predicted_count: number;
  matched_count: number;
  recall: number;
  precision_lb: number;
  run_at?: string;
  matches: Array<{
    gt_item: string;
    matched_pred_text: string;
    matched_pred_reason: string;
    similarity: number;
    judge_reason: string;
  }>;
}

export interface EvalSummary {
  peps_evaluated: number;
  total_ground_truth: number;
  total_recovered: number;
  total_predicted: number;
  overall_recall: number;
  overall_precision_lb: number;
  results: EvalResultItem[];
  run_at?: string;
  status?: string;
}

export const MOCK_DECISIONS: Decision[] = [];

export const MOCK_GRAPH_DATA = {
  nodes: [],
  edges: [],
};

export const MOCK_EVAL_SUMMARY: EvalSummary = {
  peps_evaluated: 8,
  total_ground_truth: 22,
  total_recovered: 14,
  total_predicted: 21,
  overall_recall: 0.636,
  overall_precision_lb: 0.667,
  results: [
    {
      pep_number: 582,
      title: "Python local packages directory (__pypackages__)",
      ground_truth_count: 3,
      predicted_count: 4,
      matched_count: 2,
      recall: 0.667,
      precision_lb: 0.500,
      run_at: "2026-11-18T22:45:00Z",
      matches: [
        {
          gt_item: "Require explicit CLI flag to enable __pypackages__ lookup",
          matched_pred_text: "Enable __pypackages__ only when explicit flag is passed to Python CLI",
          matched_pred_reason: "Defeats the primary ergonomics purpose of making virtualenv management invisible.",
          similarity: 0.884,
          judge_reason: "Both proposals discuss gating __pypackages__ discovery behind a CLI argument and reject it due to ergonomics."
        },
        {
          gt_item: "Support arbitrary nested subdirectories for packages",
          matched_pred_text: "Traverse parent directories looking for nearest __pypackages__",
          matched_pred_reason: "Causes unpredictable package shadowing when running scripts from subdirectories.",
          similarity: 0.762,
          judge_reason: "Matches the ground truth concern regarding parent directory resolution and scoping conflicts."
        }
      ]
    },
    {
      pep_number: 695,
      title: "Type Parameter Syntax",
      ground_truth_count: 3,
      predicted_count: 3,
      matched_count: 2,
      recall: 0.667,
      precision_lb: 0.667,
      run_at: "2026-11-18T22:46:10Z",
      matches: [
        {
          gt_item: "Use TypeAlias marker with runtime assignment instead of new keyword",
          matched_pred_text: "Reuse typing.TypeAlias with runtime assignment",
          matched_pred_reason: "Does not allow forward references cleanly and causes circular import deadlocks.",
          similarity: 0.912,
          judge_reason: "Identical rejected proposal: reusing TypeAlias instead of the dedicated 'type' keyword."
        }
      ]
    },
    {
      pep_number: 703,
      title: "Making the Global Interpreter Lock Optional in CPython",
      ground_truth_count: 4,
      predicted_count: 3,
      matched_count: 3,
      recall: 0.750,
      precision_lb: 1.000,
      run_at: "2026-11-18T22:47:30Z",
      matches: [
        {
          gt_item: "Use coarse-grained interpreter-level locking for single-threaded scripts",
          matched_pred_text: "Dynamically enable the GIL for single-threaded scripts and disable only when threads spawn",
          matched_pred_reason: "Thread-switching race conditions during retroactive GIL-disabling lead to intractable memory model bugs.",
          similarity: 0.841,
          judge_reason: "Both describe dynamic/coarse toggling of the GIL to save single-threaded performance."
        }
      ]
    }
  ]
};
