import React, { useState, useEffect } from 'react';
import { analyzePR } from '../lib/api';
import { FeedbackWidget } from '../components/FeedbackWidget';
import { useRepo } from '../context/RepoContext';

export default function PRSimulatorPage() {
  const { activeRepo } = useRepo();
  const [repo, setRepo] = useState(activeRepo !== 'all' ? activeRepo : 'psf/black');
  const [changedFiles, setChangedFiles] = useState('src/black/linegen.py\nsrc/black/__init__.py');
  const [prTitle, setPrTitle] = useState('Change default line length to 79 characters for strict PEP 8 compliance');
  const [diffSummary, setDiffSummary] = useState('Replaces 88-character limit with 79 characters to align with PEP 8 standards.');

  useEffect(() => {
    if (activeRepo && activeRepo !== 'all') {
      setRepo(activeRepo);
      if (activeRepo.includes('django')) {
        applyPreset('django-session-keys');
      } else if (activeRepo.includes('black')) {
        applyPreset('black-line-length');
      }
    }
  }, [activeRepo]);
  
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
        threshold: 0.25,
      });
      setResult(resp);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (presetName: string) => {
    if (presetName === 'black-line-length') {
      setRepo('psf/black');
      setChangedFiles('src/black/linegen.py\nsrc/black/__init__.py');
      setPrTitle('Change default line length to 79 characters for strict PEP 8 compliance');
      setDiffSummary('Replaces 88-character limit with 79 characters to align with PEP 8 standards.');
    } else if (presetName === 'django-session-keys') {
      setRepo('django/django');
      setChangedFiles('django/contrib/sessions/backends/base.py');
      setPrTitle('Store raw plaintext session keys in session store instead of hashing');
      setDiffSummary('Reverts SESSION_STORE_KEY_HASH and uses plain unhashed session keys.');
    } else if (presetName === 'django-tabular-delete') {
      setRepo('django/django');
      setChangedFiles('django/contrib/admin/options.py');
      setPrTitle('Show Delete checkbox in TabularInline when deletion is disallowed');
      setDiffSummary('Renders Delete? column in TabularInline for extra form rows.');
    } else if (presetName === 'black-quotes') {
      setRepo('psf/black');
      setChangedFiles('src/black/strings.py\nsrc/black/trans.py');
      setPrTitle('Add option to prefer single quotes for strings');
      setDiffSummary('Preserves author-authored single quotes instead of normalizing to double quotes.');
    } else if (presetName === 'black-hex-revert') {
      setRepo('psf/black');
      setChangedFiles('src/black/numerics.py\nsrc/black/__init__.py');
      setPrTitle('Uppercase hexadecimal numeric literals 0xff -> 0xFF');
      setDiffSummary('Automatically normalizes hex literals to uppercase.');
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
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500 text-[11px]">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('django-session-keys')}
                  className="rounded bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 text-emerald-300 hover:bg-emerald-900/80 font-mono text-[11px]"
                >
                  django: session-hash
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('django-tabular-delete')}
                  className="rounded bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 text-emerald-300 hover:bg-emerald-900/80 font-mono text-[11px]"
                >
                  django: admin-delete
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('black-line-length')}
                  className="rounded bg-gray-800 px-2 py-0.5 text-blue-400 hover:bg-gray-700 font-mono text-[11px]"
                >
                  black: line-length (88 vs 79)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('black-quotes')}
                  className="rounded bg-gray-800 px-2 py-0.5 text-blue-400 hover:bg-gray-700 font-mono text-[11px]"
                >
                  quote-normalization
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('black-hex-revert')}
                  className="rounded bg-gray-800 px-2 py-0.5 text-amber-400 hover:bg-gray-700 font-mono text-[11px]"
                >
                  hex-revert (PR #585)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('cpython-pep582')}
                  className="rounded bg-gray-800 px-2 py-0.5 text-purple-400 hover:bg-gray-700 font-mono text-[11px]"
                >
                  pep-582
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

