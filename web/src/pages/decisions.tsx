import React, { useState, useEffect } from 'react';
import { fetchDecisions, fetchDiscussions, fetchDiscussionDetail, DiscussionSummary, DiscussionDetail } from '../lib/api';
import { Decision } from '../lib/mockData';
import { DecisionCard } from '../components/DecisionCard';
import { OutcomeBadge, PlatformBadge, ConfidenceBadge } from '../components/SourceBadge';
import { QuoteViewer } from '../components/QuoteViewer';
import { useRepo } from '../context/RepoContext';

export default function DecisionsPage() {
  const { activeRepo, setActiveRepo, repositories, refreshRepositories, loadNewRepo, loadingRepo, removeRepo } = useRepo();
  
  // Section Mode: 'main' (active/new data) vs 'previous' (historical data from prior repos)
  const [sectionMode, setSectionMode] = useState<'main' | 'previous'>('main');
  
  // View mode inside active section: decisions vs discussions
  const [viewMode, setViewMode] = useState<'decisions' | 'discussions'>('decisions');

  // Selected previous repo for filtering inside the Previous Data section
  const [selectedPrevRepo, setSelectedPrevRepo] = useState<string>('');
  
  // Repo Removal State
  const [confirmDeleteRepo, setConfirmDeleteRepo] = useState<string | null>(null);
  const [isDeletingRepo, setIsDeletingRepo] = useState<boolean>(false);
  const [deleteBanner, setDeleteBanner] = useState<{ success: boolean; message: string } | null>(null);

  // Decisions State
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [activeDecision, setActiveDecision] = useState<Decision | null>(null);

  // Discussions State
  const [discussions, setDiscussions] = useState<DiscussionSummary[]>([]);
  const [activeDiscussion, setActiveDiscussion] = useState<DiscussionDetail | null>(null);
  const [loadingDiscussionDetail, setLoadingDiscussionDetail] = useState(false);

  // Ingest Form State
  const [repoInput, setRepoInput] = useState('');
  const [ingestBanner, setIngestBanner] = useState<{ success: boolean; message: string } | null>(null);

  const loadData = async (queryText?: string) => {
    setLoading(true);
    try {
      const q = queryText !== undefined ? queryText : searchQuery;
      const [decData, discData] = await Promise.all([
        fetchDecisions({
          q: q || undefined,
          outcome: selectedOutcome || undefined,
          path: selectedPath || undefined,
        }),
        fetchDiscussions(undefined, 100, q || undefined),
      ]);

      setDecisions(decData);
      setDiscussions(discData);

      if (decData.length > 0 && !activeDecision) {
        setActiveDecision(decData[0]);
      }
      if (discData.length > 0 && !activeDiscussion) {
        selectDiscussion(discData[0].thread_id);
      }
    } catch (err) {
      console.warn('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectDiscussion = async (threadId: string) => {
    setLoadingDiscussionDetail(true);
    try {
      const detail = await fetchDiscussionDetail(threadId);
      setActiveDiscussion(detail);
    } catch (e) {
      console.warn('Failed to load discussion detail:', e);
    } finally {
      setLoadingDiscussionDetail(false);
    }
  };

  useEffect(() => {
    loadData();
    refreshRepositories();
  }, [selectedOutcome]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      loadData('');
      return;
    }

    // Check if query is a GitHub PR or Issue URL (or repo#123)
    const isPrUrl = /(?:github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/\d+|^[^/]+\/[^/]+(?:#|\/(?:pull|issues)\/)\d+)/i.test(query);
    if (isPrUrl) {
      await executeIngest(query);
      return;
    }

    loadData();
  };

  const executeIngest = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    setIngestBanner(null);
    const result = await loadNewRepo(targetUrl.trim());
    setIngestBanner(result);
    if (result.success) {
      setRepoInput('');
      await loadData();
      await refreshRepositories();
      // Ensure we switch to the Main Section with the new data
      setSectionMode('main');
      if (result.repo) {
        setActiveRepo(result.repo);
      }
      if (result.is_single_pr && result.thread_id) {
        setViewMode('discussions');
        selectDiscussion(result.thread_id);
      }
      setTimeout(() => setIngestBanner(null), 8000);
    }
  };

  const handleInlineIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeIngest(repoInput);
  };

  const executeDeleteRepo = async (repo: string) => {
    setIsDeletingRepo(true);
    try {
      const res = await removeRepo(repo);
      setDeleteBanner(res);
      setConfirmDeleteRepo(null);
      if (selectedPrevRepo === repo) {
        setSelectedPrevRepo('');
      }
      await loadData();
      await refreshRepositories();
      setTimeout(() => setDeleteBanner(null), 6000);
    } catch (e: any) {
      setDeleteBanner({ success: false, message: e.message || 'Failed to remove repository' });
    } finally {
      setIsDeletingRepo(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Data Partitioning: Main Section (Active/New) vs Previous Data Section
  // ---------------------------------------------------------------------------
  const currentRepo = activeRepo || (repositories.length > 0 ? repositories[0] : '');
  const previousRepos = repositories.filter((r) => r !== currentRepo);

  // Main Section Data (Scoped to current active repo)
  const mainDecisions = decisions.filter(
    (d) => !currentRepo || d.repo_or_forum === currentRepo || d.thread_id.includes(currentRepo)
  );
  const mainDiscussions = discussions.filter(
    (d) => !currentRepo || d.thread_id.includes(currentRepo) || d.url.includes(currentRepo)
  );

  // Previous Data Section Data (Scoped to previous repos)
  const allPrevDecisions = decisions.filter(
    (d) => currentRepo ? d.repo_or_forum !== currentRepo && !d.thread_id.includes(currentRepo) : false
  );
  const allPrevDiscussions = discussions.filter(
    (d) => currentRepo ? !d.thread_id.includes(currentRepo) && !d.url.includes(currentRepo) : false
  );

  const displayedPrevDecisions = selectedPrevRepo
    ? allPrevDecisions.filter((d) => d.repo_or_forum === selectedPrevRepo || d.thread_id.includes(selectedPrevRepo))
    : allPrevDecisions;

  const displayedPrevDiscussions = selectedPrevRepo
    ? allPrevDiscussions.filter((d) => d.thread_id.includes(selectedPrevRepo) || d.url.includes(selectedPrevRepo))
    : allPrevDiscussions;

  // Active items based on current section
  const currentDecisions = sectionMode === 'main' ? mainDecisions : displayedPrevDecisions;
  const currentDiscussions = sectionMode === 'main' ? mainDiscussions : displayedPrevDiscussions;

  // Client-side search query filtering
  const cleanQ = searchQuery.toLowerCase().replace(/^#/, '').trim();
  const isPrQuery = /(?:github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/\d+|^[^/]+\/[^/]+(?:#|\/(?:pull|issues)\/)\d+)/i.test(searchQuery.trim());
  
  const filteredDiscussions = currentDiscussions.filter((disc) => {
    if (!cleanQ) return true;
    return (
      disc.title.toLowerCase().includes(cleanQ) ||
      disc.thread_id.toLowerCase().includes(cleanQ) ||
      disc.url.toLowerCase().includes(cleanQ)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1a2233] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Engineering Decisions & Discussions</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Unrecorded engineering decisions extracted from PRs, code reviews, and forum threads with 100% verified quotes.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="rounded-md bg-[#101726] border border-[#1e2a3f] px-3 py-1 font-mono text-slate-300">
            <strong className="text-white font-semibold">{decisions.length}</strong> decisions • <strong className="text-white font-semibold">{discussions.length}</strong> discussions indexed
          </span>
        </div>
      </div>

      {/* Top Bar: Ingest Any GitHub Repo or PR */}
      <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-3.5 sm:p-4 shadow-sm">
        <form onSubmit={handleInlineIngest} className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500 text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Paste any GitHub repository URL or specific PR (e.g. huggingface/diffusers or https://github.com/.../pull/15107)..."
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              disabled={loadingRepo}
              className="w-full rounded-lg bg-[#070a12] border border-[#1c273c] pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loadingRepo || !repoInput.trim()}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-5 py-2.5 text-xs sm:text-sm font-semibold shrink-0 disabled:opacity-50 transition shadow-sm"
          >
            {loadingRepo ? (
              <>
                <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                <span>Ingesting & Extracting...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Load Repo / PR</span>
              </>
            )}
          </button>
        </form>

        {ingestBanner && (
          <div
            className={`mt-3 rounded-lg p-3 text-xs border ${
              ingestBanner.success
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            {ingestBanner.message}
          </div>
        )}
      </div>

      {/* Primary Section Switcher: Main Section (Active/New Data) vs Previous Data Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1a2233] pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSectionMode('main')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
              sectionMode === 'main'
                ? 'bg-[#121a29] text-sky-400 border-sky-500/40 shadow-sm'
                : 'bg-[#0a0e17] text-slate-400 hover:text-white border-[#1c273c]'
            }`}
          >
            <span>Main Section: Active Data</span>
            {currentRepo && (
              <span className="rounded bg-[#080d17] border border-sky-500/30 px-1.5 py-0.5 text-[10px] text-sky-300 font-mono">
                {currentRepo}
              </span>
            )}
          </button>

          <button
            onClick={() => setSectionMode('previous')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
              sectionMode === 'previous'
                ? 'bg-[#121a29] text-sky-400 border-sky-500/40 shadow-sm'
                : 'bg-[#0a0e17] text-slate-400 hover:text-white border-[#1c273c]'
            }`}
          >
            <span>Previous Data Archive</span>
            <span className="rounded bg-[#080d17] px-1.5 py-0.5 text-[10px] text-slate-400 font-mono border border-[#1a2538]">
              {previousRepos.length} repos
            </span>
          </button>
        </div>

        {sectionMode === 'main' && currentRepo && (
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Active Repository: <strong className="text-white font-mono">{currentRepo}</strong></span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2: PREVIOUS DATA SECTION (Organized Previous Repositories) */}
      {/* ------------------------------------------------------------------ */}
      {sectionMode === 'previous' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Previously Ingested Repositories</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historical decisions and discussions from earlier repository ingestions. Click "Make Active" to load any into the Main Section.
                </p>
              </div>
              {selectedPrevRepo && (
                <button
                  onClick={() => setSelectedPrevRepo('')}
                  className="text-xs text-sky-400 hover:text-sky-300 underline font-medium"
                >
                  Show All Previous Repositories
                </button>
              )}
            </div>

            {deleteBanner && (
              <div
                className={`mb-3 rounded-lg p-3 text-xs border ${
                  deleteBanner.success
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {deleteBanner.message}
              </div>
            )}

            {previousRepos.length === 0 ? (
              <div className="p-8 text-center rounded-lg border border-dashed border-[#1a2336] text-xs text-slate-400">
                No previous repositories yet. As you load new repositories above, earlier repositories will be archived here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {previousRepos.map((repo) => {
                  const repoDecs = decisions.filter((d) => d.repo_or_forum === repo || d.thread_id.includes(repo)).length;
                  const repoDiscs = discussions.filter((d) => d.thread_id.includes(repo) || d.url.includes(repo)).length;
                  const isSelected = selectedPrevRepo === repo;
                  const isConfirming = confirmDeleteRepo === repo;
                  return (
                    <div
                      key={repo}
                      className={`rounded-lg border p-3.5 transition space-y-2.5 ${
                        isSelected
                          ? 'border-sky-500 bg-[#0f1728]'
                          : 'border-[#1b253b] bg-[#090d16] hover:border-[#27344f]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-white truncate max-w-[190px]">
                          {repo}
                        </span>
                        <span className="rounded bg-[#101726] px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-[#1e2a3f]">
                          {repoDecs} dec • {repoDiscs} disc
                        </span>
                      </div>

                      {isConfirming ? (
                        <div className="flex items-center justify-between pt-2 border-t border-rose-900/60 bg-rose-950/30 -mx-1 px-2.5 py-1.5 rounded">
                          <span className="text-[11px] text-rose-300 font-semibold">Delete repository data?</span>
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => executeDeleteRepo(repo)}
                              disabled={isDeletingRepo}
                              className="rounded bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 text-xs font-bold transition disabled:opacity-50"
                            >
                              {isDeletingRepo ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteRepo(null)}
                              disabled={isDeletingRepo}
                              className="rounded bg-[#121927] hover:bg-[#182338] text-slate-300 px-2 py-1 text-xs transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1.5 pt-1 border-t border-[#161f30]">
                          <button
                            onClick={() => {
                              setActiveRepo(repo);
                              setSectionMode('main');
                            }}
                            className="flex-1 rounded bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 py-1 text-[11px] font-semibold text-sky-300 transition text-center"
                          >
                            Make Active
                          </button>
                          <button
                            onClick={() => setSelectedPrevRepo(isSelected ? '' : repo)}
                            className="rounded bg-[#121927] hover:bg-[#182338] border border-[#1e2a3f] py-1 px-2.5 text-[11px] font-medium text-slate-300 transition"
                          >
                            {isSelected ? 'Reset' : 'Browse'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteRepo(repo)}
                            className="rounded bg-rose-950/30 hover:bg-rose-900/50 border border-rose-800/40 py-1 px-2 text-[11px] font-medium text-rose-300 transition flex items-center space-x-1"
                            title={`Remove ${repo} and all its data`}
                          >
                            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-View Switcher Tabs: Decisions vs Discussions */}
      <div className="flex items-center justify-between border-b border-[#1a2233] pb-2">
        <div className="flex space-x-3">
          <button
            onClick={() => setViewMode('decisions')}
            className={`flex items-center space-x-2 pb-2 px-1 text-xs sm:text-sm font-semibold transition border-b-2 ${
              viewMode === 'decisions'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Architectural Decisions</span>
            <span className="rounded-full bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-[10px] font-mono text-slate-300">
              {currentDecisions.length}
            </span>
          </button>

          <button
            onClick={() => setViewMode('discussions')}
            className={`flex items-center space-x-2 pb-2 px-1 text-xs sm:text-sm font-semibold transition border-b-2 ${
              viewMode === 'discussions'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Discussion Threads</span>
            <span className="rounded-full bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-[10px] font-mono text-slate-300">
              {filteredDiscussions.length}
            </span>
          </button>
        </div>

        <span className="hidden sm:inline-block text-[11px] text-slate-500 font-mono">
          {sectionMode === 'main' ? `Active: ${currentRepo || 'All'}` : `Viewing Archived Repositories`}
        </span>
      </div>

      {/* Universal Search and Filter Bar */}
      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 bg-[#0a0e17] p-3 rounded-xl border border-[#1a2336]">
        <div className={viewMode === 'decisions' ? "md:col-span-6" : "md:col-span-9"}>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder={
                viewMode === 'decisions'
                  ? "Search decisions by PR #, keyword, rationale, or paste PR link..."
                  : "Search discussions by PR #, title keyword, or paste PR link..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] pl-8 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        {viewMode === 'decisions' ? (
          <>
            <div className="md:col-span-3">
              <select
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(e.target.value)}
                className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-2 text-xs sm:text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="">All Outcomes</option>
                <option value="adopted">Adopted</option>
                <option value="rejected">Rejected</option>
                <option value="reverted">Reverted</option>
                <option value="deferred">Deferred</option>
              </select>
            </div>
            <div className="md:col-span-3 flex space-x-2">
              <input
                type="text"
                placeholder="Filter by file path..."
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                className="w-full rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shrink-0"
              >
                Filter
              </button>
            </div>
          </>
        ) : (
          <div className="md:col-span-3 flex space-x-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition"
            >
              Search
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  loadData('');
                }}
                className="rounded-lg bg-[#121927] border border-[#1c273c] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#182338] transition"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </form>

      {/* VIEW 1: ARCHITECTURAL DECISIONS CATALOG */}
      {viewMode === 'decisions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Decision Cards */}
            <div className="lg:col-span-7 space-y-3.5">
              {loading ? (
                <div className="flex h-48 items-center justify-center rounded-xl border border-[#1a2336] bg-[#0a0e17]">
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-sky-500 border-r-transparent"></div>
                    <span>Loading verified decisions...</span>
                  </div>
                </div>
              ) : currentDecisions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-[#1a2336] bg-[#0a0e17]/60 space-y-2">
                  <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-xs sm:text-sm font-medium text-slate-300">
                    {sectionMode === 'main' && currentRepo
                      ? `No decisions extracted for "${currentRepo}" yet.`
                      : 'No decisions match your search criteria.'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Enter any public repository URL in the top bar to ingest issues and extract architectural consensus.
                  </p>
                </div>
              ) : (
                currentDecisions.map((dec) => (
                  <DecisionCard
                    key={dec.id}
                    decision={dec}
                    onSelect={setActiveDecision}
                    selected={activeDecision?.id === dec.id}
                  />
                ))
              )}
            </div>

            {/* Right Column: Active Decision Detail Drawer */}
            <div className="lg:col-span-5">
              <div className="sticky top-20 rounded-xl border border-[#1a2336] bg-[#0a0e17] p-5 space-y-4 shadow-sm">
                {activeDecision ? (
                  <>
                    <div className="border-b border-[#161f30] pb-3.5">
                      <div className="flex items-center space-x-2 mb-2">
                        <OutcomeBadge outcome={activeDecision.outcome} />
                        <PlatformBadge platform={activeDecision.repo_or_forum} />
                        <ConfidenceBadge confidence={activeDecision.confidence} />
                      </div>
                      <h2 className="text-base font-bold text-white leading-snug">
                        {activeDecision.title}
                      </h2>
                      <div className="mt-2 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                        <span className="truncate max-w-[200px]">Thread: {activeDecision.thread_id}</span>
                        <button
                          onClick={() => {
                            setViewMode('discussions');
                            selectDiscussion(activeDecision.thread_id);
                          }}
                          className="text-sky-400 hover:text-sky-300 font-sans text-xs underline shrink-0"
                        >
                          View Full Thread
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
                        Architectural Rationale
                      </h4>
                      <p className="text-xs text-slate-200 leading-relaxed bg-[#07090f] p-3 rounded-lg border border-[#161f30]">
                        {activeDecision.rationale}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                        Verified Evidence Quotes ({activeDecision.evidence.length})
                      </h4>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {activeDecision.evidence.map((ev, idx) => (
                          <QuoteViewer key={idx} evidence={ev} label={`Citation #${idx + 1}`} />
                        ))}
                      </div>
                    </div>

                    {activeDecision.alternatives && activeDecision.alternatives.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-mono uppercase tracking-wider text-rose-400 mb-2 font-semibold">
                          Rejected Alternatives ({activeDecision.alternatives.length})
                        </h4>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {activeDecision.alternatives.map((alt, idx) => (
                            <div key={idx} className="rounded-lg border border-rose-950/60 bg-rose-950/20 p-2.5 text-xs space-y-1">
                              <div className="font-semibold text-rose-300">Proposal: {alt.text}</div>
                              <div className="text-slate-300 text-[11px]"><span className="text-slate-400 font-medium">Reason: </span>{alt.reason}</div>
                              {alt.evidence && <QuoteViewer evidence={alt.evidence} label="Proposal Quote" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#161f30] text-[10px] font-mono text-slate-500 flex justify-between items-center">
                      <span>Model: <span className="text-slate-400">{activeDecision.extractor_model}</span></span>
                      <span>Decided: {activeDecision.decided_at ? new Date(activeDecision.decided_at).toLocaleDateString() : 'Recorded'}</span>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Select a decision on the left to inspect its verified quotes and evidence.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: DISCUSSION THREADS */}
      {viewMode === 'discussions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Discussion Cards */}
          <div className="lg:col-span-7 space-y-3">
            {loading ? (
              <div className="flex h-48 items-center justify-center rounded-xl border border-[#1a2336] bg-[#0a0e17]">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-sky-500 border-r-transparent"></div>
                  <span>Loading discussion threads...</span>
                </div>
              </div>
            ) : filteredDiscussions.length === 0 ? (
              isPrQuery ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-sky-500/40 bg-[#0f1728] space-y-3">
                  <p className="text-sm font-semibold text-sky-200">
                    Found a GitHub PR link in your search query
                  </p>
                  <p className="text-xs text-slate-400 font-mono max-w-md mx-auto truncate">
                    {searchQuery.trim()}
                  </p>
                  <button
                    onClick={() => executeIngest(searchQuery.trim())}
                    disabled={loadingRepo}
                    className="inline-flex items-center space-x-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-5 py-2.5 text-xs font-semibold shadow-sm"
                  >
                    {loadingRepo ? <span>Ingesting PR...</span> : <span>Ingest & View PR Discussion</span>}
                  </button>
                </div>
              ) : (
                <div className="p-12 text-center rounded-xl border border-dashed border-[#1a2336] bg-[#0a0e17]">
                  <p className="text-xs sm:text-sm text-slate-400">
                    {searchQuery
                      ? `No discussion threads match "${searchQuery}".`
                      : sectionMode === 'main' && currentRepo
                      ? `No discussion threads ingested for "${currentRepo}" yet.`
                      : 'No discussion threads found.'}
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        loadData('');
                      }}
                      className="mt-3 text-xs text-sky-400 underline hover:text-sky-300"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              )
            ) : (
              filteredDiscussions.map((disc) => {
                const isSelected = activeDiscussion?.thread_id === disc.thread_id;
                return (
                  <div
                    key={disc.thread_id}
                    onClick={() => selectDiscussion(disc.thread_id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
                      isSelected
                        ? 'border-sky-500 bg-[#0e1422] shadow-sm'
                        : 'border-[#1a2336] bg-[#0a0e17] hover:border-[#27344f] hover:bg-[#0c111c]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="rounded bg-[#101726] text-sky-300 border border-[#1f2b40] px-2 py-0.5 text-[10px] font-mono uppercase font-semibold">
                          {disc.platform.replace('github_', '').replace('_', ' ')}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(disc.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="rounded bg-[#101726] border border-[#1e2a3f] px-2 py-0.5 text-[10px] font-mono text-slate-300">
                        {disc.comment_count} comments
                      </span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-semibold text-white leading-snug">
                      {disc.title}
                    </h3>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] pt-2 border-t border-[#161f30]">
                      <span className="text-slate-500 font-mono truncate max-w-[280px]">
                        {disc.thread_id}
                      </span>
                      <a
                        href={disc.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sky-400 hover:text-sky-300 flex items-center space-x-1 font-mono text-[11px]"
                      >
                        <span>GitHub</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Full Discussion Detail & Comments */}
          <div className="lg:col-span-5">
            <div className="sticky top-20 rounded-xl border border-[#1a2336] bg-[#0a0e17] p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              {loadingDiscussionDetail ? (
                <div className="flex h-32 items-center justify-center text-xs text-slate-400">
                  <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-sky-500 border-r-transparent mr-2"></div>
                  <span>Loading thread comments...</span>
                </div>
              ) : activeDiscussion ? (
                <>
                  <div className="border-b border-[#161f30] pb-3">
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mb-1 font-mono">
                      <span className="uppercase text-sky-400 font-semibold">{activeDiscussion.platform}</span>
                      <span>•</span>
                      <span>{new Date(activeDiscussion.created_at).toLocaleString()}</span>
                    </div>
                    <h2 className="text-sm sm:text-base font-bold text-white leading-snug">
                      {activeDiscussion.title}
                    </h2>
                    <a
                      href={activeDiscussion.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center space-x-1 text-xs text-sky-400 hover:text-sky-300 font-mono"
                    >
                      <span>Open Thread on GitHub</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                      Discussion Comments ({activeDiscussion.comments.length})
                    </h4>

                    {activeDiscussion.comments.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        No discussion comments found in this thread.
                      </div>
                    ) : (
                      activeDiscussion.comments.map((comment) => (
                        <div
                          key={comment.comment_id}
                          className="rounded-lg border border-[#161f30] bg-[#070a12] p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-sky-300 font-mono text-[11px]">
                              @{comment.author_handle}
                            </span>
                            <span className="text-slate-500 text-[10px] font-mono">
                              {new Date(comment.posted_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                            {comment.body}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  Select a discussion thread on the left to read its full comment chain and review discussions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}    </div>
  );
}
