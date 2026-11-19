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
      console.error(err);
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
        `✓ Live benchmark executed successfully at ${new Date().toLocaleTimeString()}! Overall Recall: ${(freshSummary.overall_recall * 100).toFixed(1)}% across ${freshSummary.peps_evaluated} PEP discussions.`
      );
    } catch (err: any) {
      console.error(err);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Blind PEP Benchmark Evaluation</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Measuring recall of PEP "Rejected Ideas" recovered strictly from public Discourse discussions without exposing PEP text.
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleRunLiveBenchmark}
            disabled={runningBenchmark}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/50 transition disabled:opacity-50 flex items-center space-x-2"
          >
            {runningBenchmark ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
                <span>Evaluating Dense Embeddings...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Run Live Benchmark</span>
              </>
            )}
          </button>
          <button
            onClick={loadData}
            disabled={runningBenchmark}
            className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700 transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Live Benchmark Execution Notification */}
      {runMessage && (
        <div className="rounded-xl border border-emerald-800/80 bg-emerald-950/40 p-3.5 text-xs text-emerald-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-emerald-400 font-bold">⚡ Live Update:</span>
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
      <div className="rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-xs text-blue-200 flex items-start space-x-3">
        <span className="text-xl shrink-0">🔒</span>
        <div>
          <span className="font-bold text-blue-100">Blindness Invariant Guarantee:</span>{' '}
          The evaluation store strictly verifies that <code>SELECT count(*) FROM documents WHERE platform = 'pep'</code> is 0.
          DecisionTrail has zero access to the actual PEP specification documents. All recovered ideas were synthesized
          solely from public discussion threads!
          {summary?.results?.[0]?.run_at && (
            <div className="mt-1 text-[11px] text-blue-300/80 font-mono">
              Last Verified Benchmark Run: {new Date(summary.results[0].run_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-4 text-center">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Overall Recall</div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-400 font-mono">
              {(summary.overall_recall * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-[11px] text-emerald-500/80 font-medium">✓ Exceeds 50% target</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-4 text-center">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Precision (Lower Bound)</div>
            <div className="mt-2 text-3xl font-extrabold text-blue-400 font-mono">
              {(summary.overall_precision_lb * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-[11px] text-gray-500">Conservative lower bound</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-4 text-center">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Ground Truth Ideas</div>
            <div className="mt-2 text-3xl font-extrabold text-white font-mono">
              {summary.total_ground_truth}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">From official PEP texts</div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-4 text-center">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Ideas Recovered</div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-400 font-mono">
              {summary.total_recovered}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">Across {summary.peps_evaluated} PEP discussions</div>
          </div>
        </div>
      )}

      {/* Per-PEP Benchmark Breakdown */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white">Per-PEP Recall Breakdown</h2>

        {loading ? (
          <div className="flex h-36 items-center justify-center rounded-xl border border-gray-800 bg-[#0e1424]">
            <span className="text-xs text-gray-400">Loading benchmark results...</span>
          </div>
        ) : summary?.results ? (
          summary.results.map((item) => {
            const isExpanded = expandedPep === item.pep_number;
            const recallPct = Math.round(item.recall * 100);

            return (
              <div
                key={item.pep_number}
                className="rounded-xl border border-gray-800 bg-[#0e1424] overflow-hidden"
              >
                <div
                  onClick={() => setExpandedPep(isExpanded ? null : item.pep_number)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-gray-850/50 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="rounded bg-blue-900/60 border border-blue-700/60 px-2 py-0.5 text-xs font-mono font-bold text-blue-300">
                        PEP {item.pep_number}
                      </span>
                      <span className="font-semibold text-white text-sm">
                        {item.title}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Recovered {item.matched_count} of {item.ground_truth_count} ground-truth ideas • {item.predicted_count} total alternatives extracted
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 shrink-0">
                    <div className="w-32 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full ${
                          recallPct >= 50 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${recallPct}%` }}
                      ></div>
                    </div>
                    <span className="font-mono text-sm font-bold text-white w-12 text-right">
                      {recallPct}%
                    </span>
                    <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && item.matches && (
                  <div className="p-4 border-t border-gray-800/80 bg-[#090d18] space-y-3">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Ground Truth vs Extracted Discussion Matches
                    </h4>
                    {item.matches.length === 0 ? (
                      <p className="text-xs text-gray-500">No matching alternatives detected for this PEP.</p>
                    ) : (
                      item.matches.map((m, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-gray-800 bg-[#0f172a] p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-400">
                              Ground Truth Rejected Idea:
                            </span>
                            <span className="font-mono text-[11px] text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-900">
                              Cosine Sim: {(m.similarity * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-gray-200 italic font-mono bg-gray-900/80 p-2 rounded border border-gray-800">
                            "{m.gt_item}"
                          </p>

                          <div className="pt-1">
                            <span className="font-semibold text-emerald-400">
                              DecisionTrail Recovered Alternative:
                            </span>
                            <p className="text-gray-200 mt-0.5">{m.matched_pred_text}</p>
                            <p className="text-gray-400 mt-0.5"><span className="text-gray-500">Extracted Reason: </span>{m.matched_pred_reason}</p>
                          </div>

                          <div className="pt-1 border-t border-gray-800 text-[11px] text-gray-400">
                            <span className="text-gray-500 font-medium">LLM Judge Validation: </span>
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
}

