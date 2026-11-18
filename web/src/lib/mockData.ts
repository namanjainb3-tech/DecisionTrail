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
  type: 'Decision' | 'File' | 'Person' | 'Source';
  label?: string;
  title?: string;
  path?: string;
  outcome?: string;
  name?: string;
  handle?: string;
  url?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'AFFECTS' | 'AUTHORED_BY' | 'SOURCED_FROM' | 'RENAMED_TO' | 'DISCUSSED_IN';
}

export interface EvalResultItem {
  pep_number: number;
  title: string;
  ground_truth_count: number;
  predicted_count: number;
  matched_count: number;
  recall: number;
  precision_lb: number;
  run_at: string;
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
}

export const MOCK_DECISIONS: Decision[] = [
  {
    id: "dec_uv_resolver_01",
    repo_or_forum: "astral-sh/uv",
    thread_id: "github_astral-sh/uv_101",
    title: "Implement standalone PubGrub resolver in Rust",
    outcome: "adopted",
    rationale: "Implementing PubGrub in Rust allows complete independence from pip while matching exact backtracking semantics with 10x-100x performance gains.",
    alternatives: [
      {
        text: "Fork pip's internal resolvelib wrapper directly",
        reason: "Tightly coupled to Python interpreter startup overhead and pip's rapid internal changes.",
        evidence: {
          source_url: "https://github.com/astral-sh/uv/issues/101#issuecomment-1",
          platform: "github_issue",
          author_handle: "charliermarsh",
          posted_at: "2024-02-15T10:30:00Z",
          quote: "Wrapping resolvelib in Python would mean we're bound to Python runtime latency; a native PubGrub port gives us sub-millisecond backtracking."
        }
      },
      {
        text: "Use libsolv SAT solver bindings",
        reason: "SAT solvers lack version constraint backtrack explanations needed for readable error diagnostics.",
        evidence: {
          source_url: "https://github.com/astral-sh/uv/issues/101#issuecomment-2",
          platform: "github_issue",
          author_handle: "konstin",
          posted_at: "2024-02-15T11:45:00Z",
          quote: "While libsolv is fast, diagnosing why a dependency resolution failed is painful without PubGrub's error derivation graph."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://github.com/astral-sh/uv/pull/120",
        platform: "github_pr",
        author_handle: "charliermarsh",
        posted_at: "2024-02-16T14:20:00Z",
        quote: "We decided to write a bespoke PubGrub implementation in crates/uv-resolver tailored specifically for PyPI metadata."
      }
    ],
    confidence: 0.98,
    decided_at: "2024-02-16T14:20:00Z",
    linked_paths: ["crates/uv-resolver/src/lib.rs", "crates/uv-resolver/src/pubgrub.rs"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_uv_cache_02",
    repo_or_forum: "astral-sh/uv",
    thread_id: "github_astral-sh/uv_245",
    title: "Store unpacked wheels directly in CAS global cache",
    outcome: "adopted",
    rationale: "Unpacking wheels once into Content-Addressable Storage enables hardlinking into virtualenvs with zero copy overhead.",
    alternatives: [
      {
        text: "Symlink wheel files directly into site-packages",
        reason: "Breaks Windows compatibility where developer symlinks require elevated permissions or Developer Mode.",
        evidence: {
          source_url: "https://github.com/astral-sh/uv/issues/245#issuecomment-3",
          platform: "github_issue",
          author_handle: "charliermarsh",
          posted_at: "2024-03-01T09:15:00Z",
          quote: "Symlinks on Windows fail silently without Developer Mode; hardlinks or reflinks across the same filesystem work uniformly."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://github.com/astral-sh/uv/pull/260",
        platform: "github_pr",
        author_handle: "konstin",
        posted_at: "2024-03-02T16:00:00Z",
        quote: "We settle on a hardlink-first strategy with fallback to copy-on-write reflinks for wheel caching."
      }
    ],
    confidence: 0.96,
    decided_at: "2024-03-02T16:00:00Z",
    linked_paths: ["crates/uv-cache/src/lib.rs", "crates/uv-installer/src/site_packages.rs"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_pep582_01",
    repo_or_forum: "discourse",
    thread_id: "discourse_discuss.python.org_t_pep-582_4589",
    title: "Reject PEP 582 __pypackages__ directory specification",
    outcome: "rejected",
    rationale: "Implicit __pypackages__ directory lookup creates security vulnerabilities in shared filesystems and conflicts with isolated virtual environment tooling.",
    alternatives: [
      {
        text: "Enable __pypackages__ only when explicit flag is passed to Python CLI",
        reason: "Defeats the primary ergonomics purpose of PEP 582 which was to make virtualenv management invisible for beginners.",
        evidence: {
          source_url: "https://discuss.python.org/t/pep-582-python-local-packages-directory/4589/42",
          platform: "discourse",
          author_handle: "pradyunsg",
          posted_at: "2023-03-12T18:00:00Z",
          quote: "An opt-in flag requires users to remember command flags, negating the zero-config promise while retaining the ecosystem fragmentation."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://discuss.python.org/t/pep-582-python-local-packages-directory/4589/88",
        platform: "discourse",
        author_handle: "brettcannon",
        posted_at: "2023-03-15T21:30:00Z",
        quote: "The Steering Council has decided to reject PEP 582. The potential security and tooling complications outweigh the convenience."
      }
    ],
    confidence: 0.99,
    decided_at: "2023-03-15T21:30:00Z",
    linked_paths: ["Lib/site.py"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_pep695_01",
    repo_or_forum: "discourse",
    thread_id: "discourse_discuss.python.org_t_pep-695_24510",
    title: "Introduce dedicated 'type' statement and bracketed type parameters",
    outcome: "adopted",
    rationale: "First-class syntax `type Alias = ...` eliminates TypeVar boilerplate and makes generic variance automatically inferred.",
    alternatives: [
      {
        text: "Use typing.TypeAlias with runtime assignment",
        reason: "Does not allow forward references cleanly and prevents static checkers from inferring variance lazily.",
        evidence: {
          source_url: "https://discuss.python.org/t/pep-695-type-parameter-syntax/24510/14",
          platform: "discourse",
          author_handle: "erictraut",
          posted_at: "2023-04-10T11:00:00Z",
          quote: "TypeAlias is evaluated at runtime during module import, causing circular import deadlocks for complex type graphs."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://discuss.python.org/t/pep-695-type-parameter-syntax/24510/55",
        platform: "discourse",
        author_handle: "gvanrossum",
        posted_at: "2023-04-20T19:40:00Z",
        quote: "We agree that the dedicated 'type' keyword provides the cleanest syntax and resolves scoping ambiguities."
      }
    ],
    confidence: 0.97,
    decided_at: "2023-04-20T19:40:00Z",
    linked_paths: ["Grammar/python.gram", "Python/ast.c"],
    extractor_model: "gpt-oss-20b"
  }
];

export const MOCK_GRAPH_DATA = {
  nodes: [
    { id: "dec_uv_resolver_01", type: "Decision", title: "Implement standalone PubGrub resolver in Rust", outcome: "adopted" },
    { id: "dec_uv_cache_02", type: "Decision", title: "Store unpacked wheels directly in CAS global cache", outcome: "adopted" },
    { id: "dec_pep582_01", type: "Decision", title: "Reject PEP 582 __pypackages__ directory specification", outcome: "rejected" },
    { id: "dec_pep695_01", type: "Decision", title: "Introduce dedicated 'type' statement and bracketed type parameters", outcome: "adopted" },
    { id: "crates/uv-resolver/src/lib.rs", type: "File", path: "crates/uv-resolver/src/lib.rs" },
    { id: "crates/uv-cache/src/lib.rs", type: "File", path: "crates/uv-cache/src/lib.rs" },
    { id: "Lib/site.py", type: "File", path: "Lib/site.py" },
    { id: "charliermarsh", type: "Person", name: "Charlie Marsh", handle: "charliermarsh" },
    { id: "konstin", type: "Person", name: "Konsti", handle: "konstin" },
    { id: "brettcannon", type: "Person", name: "Brett Cannon", handle: "brettcannon" },
    { id: "src_uv_pr120", type: "Source", url: "https://github.com/astral-sh/uv/pull/120" },
    { id: "src_pep582_disc", type: "Source", url: "https://discuss.python.org/t/pep-582/4589" }
  ],
  edges: [
    { source: "dec_uv_resolver_01", target: "crates/uv-resolver/src/lib.rs", type: "AFFECTS" },
    { source: "dec_uv_resolver_01", target: "charliermarsh", type: "AUTHORED_BY" },
    { source: "dec_uv_resolver_01", target: "src_uv_pr120", type: "SOURCED_FROM" },
    { source: "dec_uv_cache_02", target: "crates/uv-cache/src/lib.rs", type: "AFFECTS" },
    { source: "dec_uv_cache_02", target: "konstin", type: "AUTHORED_BY" },
    { source: "dec_pep582_01", target: "Lib/site.py", type: "AFFECTS" },
    { source: "dec_pep582_01", target: "brettcannon", type: "AUTHORED_BY" },
    { source: "dec_pep582_01", target: "src_pep582_disc", type: "SOURCED_FROM" }
  ]
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
          matched_pred_text: "Use typing.TypeAlias with runtime assignment",
          matched_pred_reason: "Does not allow forward references cleanly and prevents lazy variance inference.",
          similarity: 0.912,
          judge_reason: "Identical rejected idea: reusing TypeAlias instead of the dedicated 'type' keyword."
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
