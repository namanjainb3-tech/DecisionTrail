import React, { useState, useEffect } from 'react';
import { analyzePR } from '../lib/api';
import { FeedbackWidget } from '../components/FeedbackWidget';
import { useRepo } from '../context/RepoContext';

export default function PRSimulatorPage() {
  const { activeRepo } = useRepo();
  const [repo, setRepo] = useState('django/django');
  const [changedFiles, setChangedFiles] = useState('django/contrib/sessions/backends/base.py');
  const [prTitle, setPrTitle] = useState('Store raw plaintext session keys in session backend instead of hashing');
  const [diffSummary, setDiffSummary] = useState('Reverts SESSION_STORE_KEY_HASH and uses plain unhashed session keys directly in the session store.');
  const [prUrlInput, setPrUrlInput] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('decisiontrail_groq_key') || '';
      setGroqApiKey(savedKey);
    }
  }, []);

  useEffect(() => {
    if (activeRepo && activeRepo !== 'all') {
      setRepo(activeRepo);
      if (activeRepo.includes('django')) {
        applyPreset('django-session-keys');
      } else if (activeRepo.includes('diffusers')) {
        applyPreset('diffusers-fp8');
      } else if (activeRepo.includes('lerobot')) {
        applyPreset('lerobot-fastwam');
      } else if (activeRepo.includes('jitsi')) {
        applyPreset('jitsi-audio');
      } else if (activeRepo.includes('react')) {
        applyPreset('react-suspense');
      }
    }
  }, [activeRepo]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    decisions: any[];
    comment_markdown: string;
  } | null>(null);

  const handleSaveGroqKey = (key: string) => {
    setGroqApiKey(key);
    if (typeof window !== 'undefined') {
      localStorage.setItem('decisiontrail_groq_key', key);
    }
  };

  const handlePrUrlPaste = (url: string) => {
    setPrUrlInput(url);
    const trimmed = url.trim();
    // Match github.com/org/repo/pull/123
    const match = trimmed.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)/);
    if (match) {
      const parsedRepo = match[1];
      const prNum = match[2];
      setRepo(parsedRepo);
      setPrTitle(`Review Pull Request #${prNum} on ${parsedRepo}`);
      setDiffSummary(`Analyzing proposed code changes for PR #${prNum} against historical decisions.`);

      if (parsedRepo.includes('diffusers')) {
        setChangedFiles('diffusers/models/modeling_utils.py');
      } else if (parsedRepo.includes('django')) {
        setChangedFiles('django/contrib/sessions/backends/base.py');
      } else if (parsedRepo.includes('lerobot')) {
        setChangedFiles('lerobot/common/policies/fastwam/modeling_fastwam.py');
      } else if (parsedRepo.includes('jitsi')) {
        setChangedFiles('modules/devices/audio_output.js');
      } else if (parsedRepo.includes('react')) {
        setChangedFiles('packages/react-devtools-shared/src/backend/views.js');
      }
    }
  };

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
        threshold: 0.20,
        groq_api_key: groqApiKey.trim() || undefined,
      });
      setResult(resp);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (presetName: string) => {
    if (presetName === 'django-session-keys') {
      setRepo('django/django');
      setChangedFiles('django/contrib/sessions/backends/base.py');
      setPrTitle('Store raw plaintext session keys in session backend instead of hashing');
      setDiffSummary('Reverts SESSION_STORE_KEY_HASH and uses plain unhashed session keys directly in the session store.');
    } else if (presetName === 'django-tabular-delete') {
      setRepo('django/django');
      setChangedFiles('django/contrib/admin/options.py');
      setPrTitle('Show Delete checkbox in TabularInline when deletion is disallowed');
      setDiffSummary('Renders Delete? column in TabularInline for extra form rows.');
    } else if (presetName === 'diffusers-fp8') {
      setRepo('huggingface/diffusers');
      setChangedFiles('diffusers/models/modeling_utils.py');
      setPrTitle('Remove warning filter for auxiliary FP8 export scales in Cosmos3');
      setDiffSummary('Filters and un-mutes Cosmos3 warnings for auxiliary FP8 export scales.');
    } else if (presetName === 'lerobot-fastwam') {
      setRepo('huggingface/lerobot');
      setChangedFiles('lerobot/common/policies/fastwam/modeling_fastwam.py');
      setPrTitle('Load FastWAM model weights directly into GPU memory');
      setDiffSummary('Bypasses CPU checkpoint staging and attempts direct CUDA allocations.');
    } else if (presetName === 'jitsi-audio') {
      setRepo('jitsi/jitsi-meet');
      setChangedFiles('modules/devices/audio_output.js');
      setPrTitle('Hardcode deviceId "default" for default audio output sink');
      setDiffSummary('Passes explicit "default" string rather than empty string for audio output.');
    } else if (presetName === 'react-suspense') {
      setRepo('react/react');
      setChangedFiles('packages/react-devtools-shared/src/backend/views.js');
      setPrTitle('Hide Suspense suspended state in DevTools view bridge');
      setDiffSummary('Removes suspended state exposition from DevTools bridge facade.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Pull Request Simulation Bot</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Simulate DecisionTrail's PR Bot analyzing incoming code changes against past architectural decisions and rejected alternatives.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={() => setShowKeyConfig(!showKeyConfig)}
            className="rounded-lg bg-gray-900 border border-gray-700 px-3 py-1.5 text-gray-300 hover:text-white hover:border-gray-600 flex items-center space-x-1.5 transition"
          >
            <span>🔑</span>
            <span>{groqApiKey ? 'Groq Key Active' : 'Groq API Key (Optional)'}</span>
          </button>
          <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-3 py-1 font-mono text-emerald-400">
            🛡️ Verbatim Quote Guard: Active
          </span>
        </div>
      </div>

      {/* Optional Groq Key Settings Card */}
      {showKeyConfig && (
        <div className="rounded-xl border border-indigo-800/70 bg-[#0d1428] p-4 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-300 flex items-center space-x-2">
              <span>⚡ Groq AI Acceleration (LLaMA-3.3-70B)</span>
            </span>
            <span className="text-gray-400 text-[11px]">Saved locally in browser</span>
          </div>
          <p className="text-gray-300 text-[11px]">
            DecisionTrail operates 100% out-of-the-box using local high-dimensional sentence-transformers embeddings.
            If you have a Groq API Key (<code>gsk_...</code>), paste it below to enable live ultra-fast LLaMA-3.3-70B model inference!
          </p>
          <div className="flex items-center space-x-2">
            <input
              type="password"
              placeholder="gsk_..."
              value={groqApiKey}
              onChange={(e) => handleSaveGroqKey(e.target.value)}
              className="flex-1 rounded-lg bg-gray-900 border border-indigo-700/60 px-3 py-1.5 text-xs text-gray-100 font-mono focus:border-indigo-400 focus:outline-none"
            />
            {groqApiKey && (
              <button
                type="button"
                onClick={() => handleSaveGroqKey('')}
                className="rounded bg-gray-800 px-3 py-1.5 text-gray-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                PR Simulation Inputs
              </h2>
            </div>

            {/* Quick Presets */}
            <div className="mb-4 space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
                Quick Repository Presets:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
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
                  onClick={() => applyPreset('diffusers-fp8')}
                  className="rounded bg-blue-950/70 border border-blue-800/80 px-2 py-0.5 text-blue-300 hover:bg-blue-900/80 font-mono text-[11px]"
                >
                  diffusers: fp8-scales
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('lerobot-fastwam')}
                  className="rounded bg-amber-950/70 border border-amber-800/80 px-2 py-0.5 text-amber-300 hover:bg-amber-900/80 font-mono text-[11px]"
                >
                  lerobot: fastwam-oom
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('jitsi-audio')}
                  className="rounded bg-purple-950/70 border border-purple-800/80 px-2 py-0.5 text-purple-300 hover:bg-purple-900/80 font-mono text-[11px]"
                >
                  jitsi: audio-sink
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('react-suspense')}
                  className="rounded bg-cyan-950/70 border border-cyan-800/80 px-2 py-0.5 text-cyan-300 hover:bg-cyan-900/80 font-mono text-[11px]"
                >
                  react: suspense-devtools
                </button>
              </div>
            </div>

            {/* Paste GitHub PR URL */}
            <div className="mb-4 pb-4 border-b border-gray-800">
              <label className="block text-gray-400 font-medium mb-1 text-xs">
                🔗 Or Paste Any GitHub PR Link to Auto-Populate:
              </label>
              <input
                type="text"
                placeholder="https://github.com/django/django/pull/22216"
                value={prUrlInput}
                onChange={(e) => handlePrUrlPaste(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono"
              />
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
                  rows={3}
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
                className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/50 transition disabled:opacity-50 flex items-center justify-center space-x-2"
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
              <span className="text-xs text-gray-500 font-mono">Simulated GitHub Comment</span>
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
                {result.comment_markdown ? (
                  <div className="rounded-lg bg-[#080d1a] border border-gray-800/80 p-5 font-sans text-xs text-gray-200 leading-relaxed whitespace-pre-line shadow-inner">
                    {result.comment_markdown}
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#080d1a] border border-emerald-900/50 p-5 font-sans text-xs text-emerald-200 leading-relaxed">
                    <div className="flex items-center space-x-2 text-emerald-400 font-bold mb-2 text-sm">
                      <span>✅</span>
                      <span>No Prior Conflicts Detected</span>
                    </div>
                    <p className="text-gray-300">
                      DecisionTrail analyzed this pull request against indexed architectural decisions and discussion threads.
                      No prior rejected alternatives or conflicting historical design choices were found for the modified paths.
                    </p>
                    <div className="mt-3 text-[11px] text-gray-500">
                      <sub>🤖 Verified against public discussions and architectural records.</sub>
                    </div>
                  </div>
                )}

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
              <div className="py-20 text-center text-xs text-gray-500 space-y-2">
                <div className="text-2xl">🤖</div>
                <p>
                  Click <strong>"Analyze Pull Request"</strong> on the left to simulate the bot comment.
                </p>
                <p className="text-[11px] text-gray-600">
                  You can use any preset or paste any GitHub PR link to see how DecisionTrail catches historical conflicts.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
