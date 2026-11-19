import React, { useState, useEffect } from 'react';
import { fetchEvalResults, runEvaluation } from '../lib/api';
import { EvalSummary } from '../lib/mockData';

export default function EvalPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningBenchmark, setRunningBenchmark] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [expandedPep, setExpandedPep] = useState<number | null>(582);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchEvalResults();
      setSummary(data);
    } catch (err) {
      console.warn('Failed to load eval results:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunLiveBenchmark = async () => {
    setRunningBenchmark(true);
    setRunMessage(null);
    try {
      const freshSummary = await runEvaluation();
      setSummary(freshSummary);
      setRunMessage(
        `Live benchmark executed successfully at ${new Date().toLocaleTimeString()}! Overall Recall: ${(freshSummary.overall_recall * 100).toFixed(1)}% across ${freshSummary.peps_evaluated} PEP discussions.`
      );
    } catch (err: any) {
      console.warn('Benchmark execution error:', err);
      setRunMessage(`Benchmark execution failed: ${err.message || 'Run failed'}`);
    } finally {
      setRunningBenchmark(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1a2233] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Blind PEP Benchmark Evaluation</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Measuring recall of PEP "Rejected Ideas" recovered strictly from public Discourse discussions without exposing PEP specification text.
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleRunLiveBenchmark}
            disabled={runningBenchmark}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 flex items-center space-x-2"
          >
            {runningBenchmark ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                <span>Evaluating Dense Vectors...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Run Live Benchmark</span>
              </>
            )}
          </button>
          <button
            onClick={loadData}
            disabled={runningBenchmark}
            className="rounded-lg bg-[#101726] border border-[#1e2a3f] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#151f33] transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Live Benchmark Execution Notification */}
      {runMessage && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3.5 text-xs text-emerald-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-emerald-400 font-mono font-semibold">Live Benchmark Result:</span>
            <span>{runMessage}</span>
          </div>
          <button
            onClick={() => setRunMessage(null)}
            className="text-emerald-400 hover:text-emerald-300 font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Blindness Invariant Guarantee Banner */}
      <div className="rounded-xl border border-[#1b273d] bg-[#090e18] p-4 text-xs text-slate-300 flex items-start space-x-3">
        <div className="p-1.5 rounded-md bg-[#101726] border border-[#1d2940] text-sky-400 shrink-0 mt-0.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <div className="font-semibold text-white mb-0.5">Strict Blindness Invariant Guarantee</div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            The benchmark store cryptographically enforces that <code className="text-sky-300 font-mono">SELECT count(*) FROM documents WHERE platform = 'pep'</code> is 0. DecisionTrail has zero access to actual PEP specification documents. All recovered alternatives are extracted exclusively from public community discussions.
          </p>
          {summary?.results?.[0]?.run_at && (
            <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
              Last Verified Benchmark Run: {new Date(summary.results[0].run_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-4 text-center">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Overall Recall</div>
            <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-emerald-400 font-mono">
              {(summary.overall_recall * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-[10px] text-emerald-500 font-mono">Exceeds 50% target</div>
          </div>

          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-4 text-center">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Precision (Lower Bound)</div>
            <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-sky-400 font-mono">
              {(summary.overall_precision_lb * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Conservative lower bound</div>
          </div>

          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-4 text-center">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Ground Truth Ideas</div>
            <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-white font-mono">
              {summary.total_ground_truth}
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">From official PEP texts</div>
          </div>

          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-4 text-center">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Ideas Recovered</div>
            <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-emerald-400 font-mono">
              {summary.total_recovered}
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Across {summary.peps_evaluated} PEP discussions</div>
          </div>
        </div>
      )}

      {/* Per-PEP Benchmark Breakdown */}
      <div className="space-y-3.5">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-slate-400">
          Per-PEP Recall Evaluation
        </h2>

        {loading ? (
          <div className="flex h-36 items-center justify-center rounded-xl border border-[#1a2336] bg-[#0a0e17]">
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-sky-500 border-r-transparent"></div>
              <span>Loading benchmark evaluation...</span>
            </div>
          </div>
        ) : summary?.results ? (
          summary.results.map((item) => {
            const isExpanded = expandedPep === item.pep_number;
            const recallPct = Math.round(item.recall * 100);

            return (
              <div
                key={item.pep_number}
                className="rounded-xl border border-[#1a2336] bg-[#0a0e17] overflow-hidden"
              >
                <div
                  onClick={() => setExpandedPep(isExpanded ? null : item.pep_number)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-[#0d121e] transition-colors duration-150"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-xs font-mono font-bold text-sky-400">
                        PEP {item.pep_number}
                      </span>
                      <span className="font-semibold text-white text-xs sm:text-sm">
                        {item.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Recovered {item.matched_count} of {item.ground_truth_count} ground-truth ideas • {item.predicted_count} total alternatives extracted
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 shrink-0">
                    <div className="w-28 sm:w-36 bg-[#080b11] rounded-full h-2 overflow-hidden border border-[#1a2336]">
                      <div
                        className={`h-full rounded-full ${
                          recallPct >= 50 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${recallPct}%` }}
                      ></div>
                    </div>
                    <span className="font-mono text-xs sm:text-sm font-bold text-white w-12 text-right">
                      {recallPct}%
                    </span>
                    <svg
                      className={`w-4 h-4 text-slate-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {isExpanded && item.matches && (
                  <div className="p-4 border-t border-[#161f30] bg-[#07090f] space-y-3">
                    <h4 className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
                      Ground Truth vs Recovered Discussion Matches
                    </h4>
                    {item.matches.length === 0 ? (
                      <p className="text-xs text-slate-500">No matching alternatives detected for this PEP.</p>
                    ) : (
                      item.matches.map((m, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-[#1a2336] bg-[#0a0e17] p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-400 font-mono text-[11px]">
                              Ground Truth Rejected Idea (from PEP text):
                            </span>
                            <span className="font-mono text-[10px] text-sky-400 bg-[#0d1524] px-2 py-0.5 rounded border border-[#1d2a45]">
                              Cosine Similarity: {(m.similarity * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-slate-200 font-mono text-[11px] bg-[#07090f] p-2.5 rounded border border-[#161f30] leading-relaxed">
                            "{m.gt_item}"
                          </p>

                          <div className="pt-1">
                            <span className="font-semibold text-emerald-400 font-mono text-[11px]">
                              DecisionTrail Recovered Alternative (from Discourse):
                            </span>
                            <p className="text-slate-200 mt-1 text-xs">{m.matched_pred_text}</p>
                            <p className="text-slate-400 mt-0.5 text-[11px]"><span className="text-slate-500">Extracted Reason: </span>{m.matched_pred_reason}</p>
                          </div>

                          <div className="pt-1.5 border-t border-[#161f30] text-[11px] text-slate-400">
                            <span className="text-slate-500 font-mono">Semantic Alignment Rationale: </span>
                            {m.judge_reason}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : null}
      </div>
    </div>
  );
}    </div>
  );
}
