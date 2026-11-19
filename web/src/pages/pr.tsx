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
      console.warn('Simulation failed', err);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1a2233] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Pull Request Simulation Review</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Simulate DecisionTrail's automated CI bot checking proposed pull requests against indexed architectural consensus.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={() => setShowKeyConfig(!showKeyConfig)}
            className="rounded-md bg-[#101726] border border-[#1e2a3f] px-3 py-1.5 text-slate-300 hover:text-white hover:border-slate-500 flex items-center space-x-1.5 transition text-[11px] font-mono"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span>{groqApiKey ? 'Groq Key Active' : 'Groq API Key (Optional)'}</span>
          </button>
          <span className="rounded-md bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 text-[11px] font-mono text-emerald-400">
            Verbatim Quote Guard: Active
          </span>
        </div>
      </div>

      {/* Optional Groq Key Settings Card */}
      {showKeyConfig && (
        <div className="rounded-xl border border-sky-800/40 bg-[#0c1322] p-4 text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sky-300 text-xs">Groq AI Acceleration (LLaMA-3.3-70B)</span>
            <span className="text-slate-400 text-[10px] font-mono">Stored in browser localStorage</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            DecisionTrail functions completely offline using local dense vector embeddings and heuristic quote extraction. Adding a Groq key (<code>gsk_...</code>) unlocks live LLaMA-3.3 inference for natural language synthesis.
          </p>
          <div className="flex items-center space-x-2">
            <input
              type="password"
              placeholder="gsk_..."
              value={groqApiKey}
              onChange={(e) => handleSaveGroqKey(e.target.value)}
              className="flex-1 rounded-lg bg-[#07090f] border border-[#202e47] px-3 py-1.5 text-xs text-slate-100 font-mono focus:border-sky-400 focus:outline-none"
            />
            {groqApiKey && (
              <button
                type="button"
                onClick={() => handleSaveGroqKey('')}
                className="rounded bg-[#121927] border border-[#1e2a3f] px-3 py-1.5 text-slate-400 hover:text-white text-xs font-mono"
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
          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-5 space-y-4">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 border-b border-[#161f30] pb-2">
              Pull Request Parameters
            </h2>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                Repository Scenario Presets:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('django-session-keys')}
                  className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-sky-300 hover:bg-[#151f33] font-mono text-[10px] transition"
                >
                  django: session-hash
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('django-tabular-delete')}
                  className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-sky-300 hover:bg-[#151f33] font-mono text-[10px] transition"
                >
                  django: admin-delete
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('diffusers-fp8')}
                  className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-sky-300 hover:bg-[#151f33] font-mono text-[10px] transition"
                >
                  diffusers: fp8-scales
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('lerobot-fastwam')}
                  className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-sky-300 hover:bg-[#151f33] font-mono text-[10px] transition"
                >
                  lerobot: fastwam-oom
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('jitsi-audio')}
                  className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-sky-300 hover:bg-[#151f33] font-mono text-[10px] transition"
                >
                  jitsi: audio-sink
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('react-suspense')}
                  className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-sky-300 hover:bg-[#151f33] font-mono text-[10px] transition"
                >
                  react: suspense-devtools
                </button>
              </div>
            </div>

            {/* Paste GitHub PR URL */}
            <div className="pt-2 border-t border-[#161f30]">
              <label className="block text-slate-400 font-medium mb-1 text-[11px] font-mono">
                Auto-fill from GitHub PR URL
              </label>
              <input
                type="text"
                placeholder="https://github.com/django/django/pull/22216"
                value={prUrlInput}
                onChange={(e) => handlePrUrlPaste(e.target.value)}
                className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none font-mono"
              />
            </div>

            <form onSubmit={handleSimulate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-mono text-[11px] mb-1">Target Repository</label>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-2 text-slate-100 font-mono focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-mono text-[11px] mb-1">PR Title</label>
                <input
                  type="text"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-mono text-[11px] mb-1">
                  Changed Files (one path per line)
                </label>
                <textarea
                  rows={2}
                  value={changedFiles}
                  onChange={(e) => setChangedFiles(e.target.value)}
                  className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] p-2.5 text-slate-100 font-mono text-[11px] focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-mono text-[11px] mb-1">
                  PR Description / Proposed Diff Summary
                </label>
                <textarea
                  rows={2}
                  value={diffSummary}
                  onChange={(e) => setDiffSummary(e.target.value)}
                  className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] p-2.5 text-slate-100 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 py-2.5 text-xs font-semibold text-white transition shadow-sm disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                    <span>Analyzing Historical Consensus...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Simulate PR Review</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right: GitHub PR Comment Preview */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#161f30] pb-3 mb-4">
              <div className="flex items-center space-x-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-sky-500 font-mono text-[10px] font-bold text-[#080b11]">
                  BOT
                </span>
                <span className="font-semibold text-white text-xs sm:text-sm">
                  decisiontrail-bot
                </span>
                <span className="rounded bg-[#101726] border border-[#1e2a3f] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                  automated ci review
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Simulated GitHub Output</span>
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center text-xs text-slate-400">
                <div className="text-center space-y-2">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-sky-500 border-r-transparent"></div>
                  <p className="font-mono text-xs">Querying hybrid knowledge graph & vector index...</p>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {result.comment_markdown ? (
                  <div className="rounded-lg bg-[#07090f] border border-[#1b253b] p-4 font-sans text-xs text-slate-200 leading-relaxed whitespace-pre-line select-text">
                    {result.comment_markdown}
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#07090f] border border-emerald-900/40 p-4 font-sans text-xs text-emerald-200 leading-relaxed space-y-2">
                    <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Architectural Review Passed</span>
                    </div>
                    <p className="text-slate-300 text-xs">
                      DecisionTrail verified these proposed code changes against all indexed architectural decisions and discussion threads. No conflicting historical design choices or rejected proposals were detected for the modified paths.
                    </p>
                    <div className="pt-2 text-[10px] font-mono text-slate-500 border-t border-[#161f30]">
                      Verified with RapidFuzz machine-validated citations.
                    </div>
                  </div>
                )}

                {/* Interactive Maintainer Feedback Hooks */}
                {result.decisions && result.decisions.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-[#161f30]">
                    <div className="text-xs font-mono font-semibold text-slate-400">
                      Simulate Maintainer Feedback:
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
              <div className="py-20 text-center text-xs text-slate-500 space-y-2">
                <svg className="w-8 h-8 text-slate-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100 4 2 2 0 000-4zm8 2a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
                <p className="text-slate-400 font-medium">
                  Select a preset on the left or enter pull request paths to simulate review.
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  DecisionTrail analyzes the proposed diff against historical discussion consensus to flag regressions before code merges.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}    </div>
  );
}
