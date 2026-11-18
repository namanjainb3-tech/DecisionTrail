import React, { useState } from 'react';
import { analyzePR } from '../lib/api';
import { FeedbackWidget } from '../components/FeedbackWidget';

export default function PRSimulatorPage() {
  const [repo, setRepo] = useState('astral-sh/uv');
  const [changedFiles, setChangedFiles] = useState('crates/uv-resolver/src/lib.rs\ncrates/uv-resolver/src/pubgrub.rs');
  const [prTitle, setPrTitle] = useState('Refactor resolver to use external SAT solver wrapper');
  const [diffSummary, setDiffSummary] = useState('Replaces custom PubGrub engine with libsolv bindings for dependency tree traversal.');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    decisions: any[];
    comment_markdown: string;
  } | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const files = changedFiles
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      const resp = await analyzePR({
        repo,
        changed_files: files,
        pr_title: prTitle,
        pr_diff_summary: diffSummary,
        threshold: 0.35,
      });
      setResult(resp);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (presetName: string) => {
    if (presetName === 'uv-resolver') {
      setRepo('astral-sh/uv');
      setChangedFiles('crates/uv-resolver/src/lib.rs\ncrates/uv-resolver/src/pubgrub.rs');
      setPrTitle('Attempting to use external SAT solver bindings');
      setDiffSummary('Proposing libsolv integration instead of native Rust PubGrub implementation.');
    } else if (presetName === 'uv-cache') {
      setRepo('astral-sh/uv');
      setChangedFiles('crates/uv-cache/src/lib.rs\ncrates/uv-installer/src/site_packages.rs');
      setPrTitle('Switch to symlinks on Windows site-packages');
      setDiffSummary('Use symlink instead of hardlinking wheels to save space.');
    } else if (presetName === 'cpython-pep582') {
      setRepo('python/cpython');
      setChangedFiles('Lib/site.py');
      setPrTitle('Add __pypackages__ support to interpreter initialization');
      setDiffSummary('Implements automatic lookup of __pypackages__ directories without virtualenvs.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Pull Request Simulator</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Simulate DecisionTrail's PR Bot analyzing incoming code changes against historic decisions.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-3 py-1 font-mono text-emerald-400">
            🛡️ Allowlist Guard: Dry-Run Active
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                PR Simulation Inputs
              </h2>
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-gray-500">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('uv-resolver')}
                  className="rounded bg-gray-800 px-2 py-0.5 text-blue-400 hover:bg-gray-700 font-mono"
                >
                  uv-resolver
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('uv-cache')}
                  className="rounded bg-gray-800 px-2 py-0.5 text-blue-400 hover:bg-gray-700 font-mono"
                >
                  uv-cache
                </button>
              </div>
            </div>

            <form onSubmit={handleSimulate} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-400 font-medium mb-1">Target Repository</label>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-2 text-gray-100 font-mono focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-medium mb-1">PR Title</label>
                <input
                  type="text"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-medium mb-1">
                  Changed Files (one path per line)
                </label>
                <textarea
                  rows={4}
                  value={changedFiles}
                  onChange={(e) => setChangedFiles(e.target.value)}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700/80 p-3 text-gray-100 font-mono focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-medium mb-1">
                  PR Description / Diff Summary
                </label>
                <textarea
                  rows={3}
                  value={diffSummary}
                  onChange={(e) => setDiffSummary(e.target.value)}
                  className="w-full rounded-lg bg-gray-900 border border-gray-700/80 p-3 text-gray-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <span>Analyzing Historical Decisions...</span>
                ) : (
                  <>
                    <span>🤖</span>
                    <span>Analyze Pull Request</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right: GitHub PR Comment Preview */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-mono text-[10px] text-white">
                  bot
                </span>
                <span className="font-semibold text-white text-sm">
                  decisiontrail-bot
                </span>
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                  automated bot comment
                </span>
              </div>
              <span className="text-xs text-gray-500 font-mono">Simulated Preview</span>
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                <div className="text-center space-y-2">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
                  <p>Searching hybrid graph + vector index...</p>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-[#080d1a] border border-gray-800/80 p-4 font-sans text-xs text-gray-200 leading-relaxed whitespace-pre-line">
                  {result.comment_markdown}
                </div>

                {/* Interactive Maintainer Feedback Hooks */}
                {result.decisions && result.decisions.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-gray-800">
                    <div className="text-xs font-semibold text-gray-400">
                      Simulate Maintainer Response:
                    </div>
                    {result.decisions.map((dec) => (
                      <FeedbackWidget
                        key={dec.id}
                        decisionId={dec.id}
                        path={changedFiles.split('\n')[0]?.trim() || ''}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-gray-500">
                Click <strong>"Analyze Pull Request"</strong> on the left to simulate the bot comment.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
