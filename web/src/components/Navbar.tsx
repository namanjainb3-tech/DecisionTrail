import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { fetchGraphStatus } from '../lib/api';
import { useRepo } from '../context/RepoContext';

export const Navbar: React.FC = () => {
  const router = useRouter();
  const { loadNewRepo, loadingRepo } = useRepo();
  const [graphStatus, setGraphStatus] = useState<{
    is_live: boolean;
    engine: string;
    instructions: string;
  } | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [ingestStatus, setIngestStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchGraphStatus().then(setGraphStatus).catch(() => null);
  }, []);

  const navItems = [
    {
      label: 'Decisions',
      href: '/decisions',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: 'Knowledge Graph',
      href: '/graph',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      label: 'PR Simulator',
      href: '/pr',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7v8a2 2 0 002 2h6M8 7a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100 4 2 2 0 000-4zm8 2a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      ),
    },
    {
      label: 'Evaluation Benchmark',
      href: '/eval',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoInput.trim()) return;
    setIngestStatus(null);
    const result = await loadNewRepo(newRepoInput.trim());
    setIngestStatus(result);
    if (result.success) {
      setTimeout(() => {
        setShowRepoModal(false);
        setIngestStatus(null);
        setNewRepoInput('');
      }, 1500);
    }
  };

  const handleQuickPreset = (repo: string) => {
    setNewRepoInput(repo);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-[#1a2233] bg-[#080b11]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
          <div className="flex items-center space-x-6">
            <Link href="/decisions" className="flex items-center space-x-2.5 group">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500 font-mono font-bold text-xs text-[#080b11] shadow-sm">
                DT
              </span>
              <span className="font-semibold tracking-tight text-white text-base">
                DecisionTrail
              </span>
              <span className="hidden lg:inline-flex items-center rounded bg-[#161f30] px-1.5 py-0.5 text-[10px] font-mono font-medium text-sky-400 border border-sky-500/20">
                v1.0
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                      active
                        ? 'bg-[#121a29] text-sky-400 border border-sky-500/30 shadow-sm'
                        : 'text-slate-400 hover:bg-[#101622] hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span className={active ? 'text-sky-400' : 'text-slate-500'}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center space-x-2">
            {/* Quick Ingest Button */}
            <button
              onClick={() => setShowRepoModal(true)}
              className="flex items-center space-x-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors duration-150"
              title="Add any public GitHub repo to DecisionTrail"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Load Repo</span>
            </button>

            {/* Graph Engine Status Pill */}
            {graphStatus && (
              <button
                onClick={() => setShowStatusModal(true)}
                className={`hidden sm:flex items-center space-x-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-mono border transition-colors duration-150 ${
                  graphStatus.is_live
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 hover:bg-emerald-950/70'
                    : 'bg-[#101726] text-slate-300 border-[#1f2a3f] hover:border-slate-600'
                }`}
                title="Inspect Graph Database Engine"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    graphStatus.is_live ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
                  }`}
                ></span>
                <span>{graphStatus.is_live ? 'Neo4j 5.x Live' : 'Graph Engine: Built-in'}</span>
              </button>
            )}

            {/* Verification Pill */}
            <div className="hidden lg:flex items-center space-x-1.5 rounded-md bg-[#0e1522] px-2.5 py-1.5 text-[11px] font-mono text-emerald-400 border border-[#1a2538]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              <span>RapidFuzz ≥ 95% Verified</span>
            </div>

            {/* Mobile Menu Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#131b29] border border-transparent hover:border-[#1e2a3f]"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1a2233] bg-[#0b0f19] px-4 py-3 space-y-1.5 animate-in slide-in-from-top-1">
            {navItems.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#131d2e] text-sky-400 border border-sky-500/30'
                      : 'text-slate-300 hover:bg-[#111724]'
                  }`}
                >
                  <span className={active ? 'text-sky-400' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Ingest Repository Modal */}
      {showRepoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#1e2638] bg-[#0c101a] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1a2233] pb-3">
              <h3 className="font-semibold text-white text-sm flex items-center space-x-2">
                <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Load Any Public GitHub Repository</span>
              </h3>
              <button
                onClick={() => {
                  setShowRepoModal(false);
                  setIngestStatus(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#141b2b] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enter any public GitHub repository link (e.g. <code className="text-sky-400 font-mono">https://github.com/jitsi/jitsi-meet</code> or <code className="text-sky-400 font-mono">astral-sh/uv</code>). DecisionTrail ingests discussion threads, filters noise, and extracts decisions with 100% verified verbatim quotes.
            </p>

            <form onSubmit={handleIngest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  GitHub Repository URL or <code className="text-sky-400 font-mono">owner/repo</code>
                </label>
                <input
                  type="text"
                  value={newRepoInput}
                  onChange={(e) => setNewRepoInput(e.target.value)}
                  placeholder="e.g. https://github.com/jitsi/jitsi-meet or django/django"
                  className="w-full rounded-lg border border-[#212d42] bg-[#080b11] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                  disabled={loadingRepo}
                />
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Quick Suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {['jitsi/jitsi-meet', 'django/django', 'huggingface/diffusers', 'astral-sh/uv', 'pallets/flask'].map(
                    (preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => handleQuickPreset(preset)}
                        className="rounded bg-[#121927] hover:bg-[#182236] border border-[#1f2b40] px-2 py-0.5 text-xs text-slate-300 font-mono transition"
                      >
                        {preset}
                      </button>
                    )
                  )}
                </div>
              </div>

              {ingestStatus && (
                <div
                  className={`rounded-lg p-3 text-xs border ${
                    ingestStatus.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  {ingestStatus.message}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-[#1a2233]">
                <button
                  type="button"
                  onClick={() => {
                    setShowRepoModal(false);
                    setIngestStatus(null);
                  }}
                  className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-[#131b29] transition"
                  disabled={loadingRepo}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loadingRepo || !newRepoInput.trim()}
                  className="flex items-center space-x-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition shadow-sm"
                >
                  {loadingRepo ? (
                    <>
                      <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                      <span>Ingesting & Extracting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Load Repository</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Graph Status Diagnostics Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#1e2638] bg-[#0c101a] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1a2233] pb-3">
              <h3 className="font-semibold text-white text-sm flex items-center space-x-2">
                <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Knowledge Graph Engine Diagnostics</span>
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#141b2b] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="bg-[#080b11] p-3 rounded-lg border border-[#1a2233]">
                <span className="text-slate-400 text-[11px] block mb-1">Active Graph Backend</span>
                <p className="font-mono font-semibold text-white text-sm">
                  {graphStatus?.engine}
                </p>
              </div>

              <div className="bg-[#080b11] p-3 rounded-lg border border-[#1a2233]">
                <span className="text-slate-400 text-[11px] block mb-1">Connection State</span>
                <div className="flex items-center space-x-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      graphStatus?.is_live ? 'bg-emerald-400' : 'bg-sky-400'
                    }`}
                  ></span>
                  <span className="font-mono text-slate-200">
                    {graphStatus?.is_live
                      ? 'Live Neo4j instance connected via Bolt protocol.'
                      : 'Built-in high-performance graph engine active (in-memory mock store).'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-[#0f1422] border border-[#1f2b40] p-3.5 space-y-2">
                <span className="font-semibold text-sky-400 block">Connecting External Neo4j 5.x</span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  DecisionTrail automatically connects to Neo4j if available. To configure Neo4j:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-mono text-[11px]">
                  <li>
                    <span className="text-white">Neo4j Aura Cloud (Free):</span> Set <code className="text-sky-300">NEO4J_URI=neo4j+s://...</code> in <code className="text-slate-400">.env</code>.
                  </li>
                  <li>
                    <span className="text-white">Local Docker:</span> Run <code className="text-sky-300">docker compose up -d</code>.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};      </div>
    </nav>
  );
};
