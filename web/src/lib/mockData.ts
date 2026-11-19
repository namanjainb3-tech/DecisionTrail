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
    id: "dec_black_line_length_01",
    repo_or_forum: "psf/black",
    thread_id: "github_psf/black_1",
    title: "Standardize default line length to 88 characters",
    outcome: "adopted",
    rationale: "88 characters is approximately 10% longer than 80, which significantly reduces vertical line explosion and AST splitting while fitting comfortably side-by-side on modern displays.",
    alternatives: [
      {
        text: "Strict 79-character limit (standard PEP 8)",
        reason: "Causes excessive vertical splitting of expressions, nested calls, and comprehensions on modern displays.",
        evidence: {
          source_url: "https://github.com/psf/black/issues/1",
          platform: "github_issue",
          author_handle: "ambv",
          posted_at: "2018-03-24T18:30:00Z",
          quote: "79 is too short for modern codebases; it forces awkward line wrapping for trivial expressions."
        }
      },
      {
        text: "Configurable line length per repository without defaults",
        reason: "Defeats the core uncompromising design goal of Black, which is to eliminate styling debates across teams.",
        evidence: {
          source_url: "https://github.com/psf/black/issues/1",
          platform: "github_issue",
          author_handle: "ambv",
          posted_at: "2018-03-24T19:00:00Z",
          quote: "Black is opinionated so you don't have to debate styling in code reviews."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://github.com/psf/black/issues/1",
        platform: "github_issue",
        author_handle: "ambv",
        posted_at: "2018-03-24T18:00:00Z",
        quote: "88 was chosen because it's roughly 10% longer than 80, which turns out to make code look much better without being too long."
      }
    ],
    confidence: 0.99,
    decided_at: "2018-03-24T18:00:00Z",
    linked_paths: ["src/black/linegen.py", "src/black/__init__.py"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_black_strings_02",
    repo_or_forum: "psf/black",
    thread_id: "github_psf/black_87",
    title: "Normalize all string literals to double quotes",
    outcome: "adopted",
    rationale: "Standardizing on double quotes prevents escaping apostrophes in English prose and eliminates noisy git diff churn caused by subjective quote preferences.",
    alternatives: [
      {
        text: "Preserve author-preferred single quotes",
        reason: "Leaves inconsistent quote styling in codebases and creates merge conflicts on neighboring line edits.",
        evidence: {
          source_url: "https://github.com/psf/black/issues/87",
          platform: "github_issue",
          author_handle: "zsol",
          posted_at: "2018-04-12T15:00:00Z",
          quote: "Allowing single quotes creates ongoing stylistic disagreements between contributors."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://github.com/psf/black/issues/87",
        platform: "github_issue",
        author_handle: "ambv",
        posted_at: "2018-04-12T14:30:00Z",
        quote: "Black standardizes on double quotes for strings to eliminate churn and ensure consistency across codebases."
      }
    ],
    confidence: 0.98,
    decided_at: "2018-04-12T14:30:00Z",
    linked_paths: ["src/black/strings.py", "src/black/trans.py"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_black_trailing_comma_03",
    repo_or_forum: "psf/black",
    thread_id: "github_psf/black_114",
    title: "Magic trailing comma multi-line parameter explosion",
    outcome: "adopted",
    rationale: "If the author includes a trailing comma, Black treats it as an explicit directive to explode parameters across multiple lines with one argument per line for minimal diff churn.",
    alternatives: [
      {
        text: "Always collapse lists if total length is under 88 characters",
        reason: "Collapses collections that intentionally have trailing commas, making adding items create ugly two-line diffs.",
        evidence: {
          source_url: "https://github.com/psf/black/issues/114",
          platform: "github_issue",
          author_handle: "ambv",
          posted_at: "2018-05-02T17:00:00Z",
          quote: "Collapsing collections that intentionally have trailing commas makes adding items create ugly two-line diffs."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://github.com/psf/black/issues/114",
        platform: "github_issue",
        author_handle: "zsol",
        posted_at: "2018-05-02T16:15:00Z",
        quote: "A trailing comma indicates the author wants this collection on multiple lines for clean git diffs."
      }
    ],
    confidence: 0.97,
    decided_at: "2018-05-02T16:15:00Z",
    linked_paths: ["src/black/brackets.py", "src/black/linegen.py"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_black_revert_hex_04",
    repo_or_forum: "psf/black",
    thread_id: "github_psf/black_585",
    title: "Revert uppercase hexadecimal numeric literal normalization",
    outcome: "reverted",
    rationale: "Automatically transforming hex literals (0xff -> 0xFF) broke bitwise flags and hardware register definitions in embedded Python libraries.",
    alternatives: [
      {
        text: "Strictly uppercase all hexadecimal numbers to 0xFF",
        reason: "Violated hardware mask conventions where lowercase represents specific bit fields.",
        evidence: {
          source_url: "https://github.com/psf/black/pull/585",
          platform: "github_pr",
          author_handle: "ambv",
          posted_at: "2018-10-14T20:00:00Z",
          quote: "Reverting automatic hex capitalization because it broke low-level bitmask conventions and register definitions."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://github.com/psf/black/pull/585",
        platform: "github_pr",
        author_handle: "ambv",
        posted_at: "2018-10-14T20:00:00Z",
        quote: "Reverting automatic hex capitalization because it broke low-level bitmask conventions and register definitions."
      }
    ],
    confidence: 0.99,
    decided_at: "2018-10-14T20:00:00Z",
    linked_paths: ["src/black/numerics.py", "src/black/__init__.py"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_black_py36_05",
    repo_or_forum: "psf/black",
    thread_id: "github_psf/black_165",
    title: "Require Python 3.6+ runtime for native AST parsing",
    outcome: "adopted",
    rationale: "Python 3.6 introduced f-strings and variable annotations which cannot be safely parsed on older Python interpreters without syntax errors.",
    alternatives: [],
    evidence: [
      {
        source_url: "https://github.com/psf/black/pull/165",
        platform: "github_pr",
        author_handle: "ambv",
        posted_at: "2018-05-20T11:00:00Z",
        quote: "Black requires Python 3.6 to run because it uses f-strings and variable annotations extensively."
      }
    ],
    confidence: 0.96,
    decided_at: "2018-05-20T11:00:00Z",
    linked_paths: ["src/black/parsing.py", "pyproject.toml"],
    extractor_model: "gpt-oss-20b"
  },
  {
    id: "dec_pep582_06",
    repo_or_forum: "discourse",
    thread_id: "discourse_discuss.python.org_t_pep-582_4589",
    title: "Reject PEP 582 __pypackages__ directory specification",
    outcome: "rejected",
    rationale: "Implicit directory lookup creates security vulnerabilities in shared filesystems and conflicts with isolated virtual environment tooling.",
    alternatives: [
      {
        text: "Enable __pypackages__ only when explicit flag is passed to Python CLI",
        reason: "Defeats the primary ergonomics promise of making virtualenv management invisible for beginners.",
        evidence: {
          source_url: "https://discuss.python.org/t/pep-582-python-local-packages-directory/4589",
          platform: "discourse",
          author_handle: "pradyunsg",
          posted_at: "2023-03-12T18:00:00Z",
          quote: "An opt-in flag requires users to remember command flags, negating the zero-config promise while retaining the ecosystem fragmentation."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://discuss.python.org/t/pep-582-python-local-packages-directory/4589",
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
    id: "dec_pep695_07",
    repo_or_forum: "discourse",
    thread_id: "discourse_discuss.python.org_t_pep-695_24510",
    title: "Adopt dedicated 'type' statement and bracketed type parameters",
    outcome: "adopted",
    rationale: "First-class syntax `type Alias = ...` eliminates TypeVar boilerplate and makes generic variance automatically inferred.",
    alternatives: [
      {
        text: "Reuse typing.TypeAlias with runtime assignment",
        reason: "Does not allow forward references cleanly and causes circular import deadlocks for complex type graphs.",
        evidence: {
          source_url: "https://discuss.python.org/t/pep-695-type-parameter-syntax/24510",
          platform: "discourse",
          author_handle: "erictraut",
          posted_at: "2023-04-10T11:00:00Z",
          quote: "TypeAlias is evaluated at runtime during module import, causing circular import deadlocks for complex type graphs."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://discuss.python.org/t/pep-695-type-parameter-syntax/24510",
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
  },
  {
    id: "dec_pep703_08",
    repo_or_forum: "discourse",
    thread_id: "discourse_discuss.python.org_t_pep-703_28096",
    title: "Make Global Interpreter Lock optional in CPython (No-GIL)",
    outcome: "adopted",
    rationale: "Multi-core scalability for CPU-bound Python workloads requires eliminating the GIL as a compile-time build option with mimalloc thread-safe memory management.",
    alternatives: [
      {
        text: "Dynamically enable the GIL for single-threaded scripts and disable only when threads spawn",
        reason: "Thread-switching race conditions during retroactive GIL-disabling lead to intractable memory model bugs.",
        evidence: {
          source_url: "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096",
          platform: "discourse",
          author_handle: "colesbury",
          posted_at: "2023-07-28T16:00:00Z",
          quote: "Dynamically toggling the GIL mid-execution introduces severe race conditions when multiple threads begin execution."
        }
      }
    ],
    evidence: [
      {
        source_url: "https://discuss.python.org/t/pep-703-making-the-global-interpreter-lock-optional-in-cpython/28096",
        platform: "discourse",
        author_handle: "colesbury",
        posted_at: "2023-07-28T18:00:00Z",
        quote: "The Steering Council accepts PEP 703 in principle, making the GIL optional as an experimental build mode."
      }
    ],
    confidence: 0.98,
    decided_at: "2023-07-28T18:00:00Z",
    linked_paths: ["Python/ceval.c", "Include/internal/pycore_ceval.h"],
    extractor_model: "gpt-oss-20b"
  }
];

export const MOCK_GRAPH_DATA = {
  nodes: [
    { id: "dec_black_line_length_01", type: "Decision", title: "Standardize default line length to 88 characters", outcome: "adopted" },
    { id: "dec_black_strings_02", type: "Decision", title: "Normalize all string literals to double quotes", outcome: "adopted" },
    { id: "dec_black_trailing_comma_03", type: "Decision", title: "Magic trailing comma multi-line parameter explosion", outcome: "adopted" },
    { id: "dec_black_revert_hex_04", type: "Decision", title: "Revert uppercase hexadecimal numeric literal normalization", outcome: "reverted" },
    { id: "dec_black_py36_05", type: "Decision", title: "Require Python 3.6+ runtime for native AST parsing", outcome: "adopted" },
    { id: "dec_pep582_06", type: "Decision", title: "Reject PEP 582 __pypackages__ directory specification", outcome: "rejected" },
    { id: "dec_pep695_07", type: "Decision", title: "Adopt dedicated 'type' statement and bracketed type parameters", outcome: "adopted" },
    { id: "dec_pep703_08", type: "Decision", title: "Make Global Interpreter Lock optional in CPython (No-GIL)", outcome: "adopted" },
    { id: "src/black/linegen.py", type: "File", path: "src/black/linegen.py" },
    { id: "src/black/strings.py", type: "File", path: "src/black/strings.py" },
    { id: "src/black/brackets.py", type: "File", path: "src/black/brackets.py" },
    { id: "src/black/numerics.py", type: "File", path: "src/black/numerics.py" },
    { id: "Lib/site.py", type: "File", path: "Lib/site.py" },
    { id: "Grammar/python.gram", type: "File", path: "Grammar/python.gram" },
    { id: "ambv", type: "Person", name: "Łukasz Langa", handle: "ambv" },
    { id: "zsol", type: "Person", name: "Zsolt Dollenstein", handle: "zsol" },
    { id: "brettcannon", type: "Person", name: "Brett Cannon", handle: "brettcannon" },
    { id: "gvanrossum", type: "Person", name: "Guido van Rossum", handle: "gvanrossum" },
    { id: "colesbury", type: "Person", name: "Sam Gross", handle: "colesbury" },
    { id: "src_black_issue_1", type: "Source", url: "https://github.com/psf/black/issues/1" },
    { id: "src_black_issue_87", type: "Source", url: "https://github.com/psf/black/issues/87" },
    { id: "src_black_pull_585", type: "Source", url: "https://github.com/psf/black/pull/585" },
    { id: "src_pep582", type: "Source", url: "https://discuss.python.org/t/pep-582-python-local-packages-directory/4589" }
  ],
  edges: [
    { source: "dec_black_line_length_01", target: "src/black/linegen.py", type: "AFFECTS" },
    { source: "dec_black_line_length_01", target: "ambv", type: "AUTHORED_BY" },
    { source: "dec_black_line_length_01", target: "src_black_issue_1", type: "SOURCED_FROM" },
    { source: "dec_black_strings_02", target: "src/black/strings.py", type: "AFFECTS" },
    { source: "dec_black_strings_02", target: "ambv", type: "AUTHORED_BY" },
    { source: "dec_black_strings_02", target: "src_black_issue_87", type: "SOURCED_FROM" },
    { source: "dec_black_trailing_comma_03", target: "src/black/brackets.py", type: "AFFECTS" },
    { source: "dec_black_trailing_comma_03", target: "zsol", type: "AUTHORED_BY" },
    { source: "dec_black_revert_hex_04", target: "src/black/numerics.py", type: "AFFECTS" },
    { source: "dec_black_revert_hex_04", target: "ambv", type: "AUTHORED_BY" },
    { source: "dec_black_revert_hex_04", target: "src_black_pull_585", type: "SOURCED_FROM" },
    { source: "dec_pep582_06", target: "Lib/site.py", type: "AFFECTS" },
    { source: "dec_pep582_06", target: "brettcannon", type: "AUTHORED_BY" },
    { source: "dec_pep582_06", target: "src_pep582", type: "SOURCED_FROM" },
    { source: "dec_pep695_07", target: "Grammar/python.gram", type: "AFFECTS" },
    { source: "dec_pep695_07", target: "gvanrossum", type: "AUTHORED_BY" }
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
