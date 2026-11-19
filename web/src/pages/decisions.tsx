import React, { useState, useEffect } from 'react';
import { fetchDecisions, fetchDiscussions, fetchDiscussionDetail, DiscussionSummary, DiscussionDetail } from '../lib/api';
import { Decision } from '../lib/mockData';
import { DecisionCard } from '../components/DecisionCard';
import { OutcomeBadge, PlatformBadge, ConfidenceBadge } from '../components/SourceBadge';
import { QuoteViewer } from '../components/QuoteViewer';
import { useRepo } from '../context/RepoContext';

export default function DecisionsPage() {
  const { activeRepo, setActiveRepo, repositories, refreshRepositories, loadNewRepo, loadingRepo } = useRepo();
  
  // Section Mode: 'main' (active/new data) vs 'previous' (historical data from prior repos)
  const [sectionMode, setSectionMode] = useState<'main' | 'previous'>('main');
  
  // View mode inside active section: decisions vs discussions
  const [viewMode, setViewMode] = useState<'decisions' | 'discussions'>('decisions');

  // Selected previous repo for filtering inside the Previous Data section
  const [selectedPrevRepo, setSelectedPrevRepo] = useState<string>('');
  
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
      console.error('Failed to load data:', err);
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
      console.error('Failed to load discussion detail:', e);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Engineering Decisions & Discussions</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Unrecorded engineering decisions extracted from live PRs, issues, and forum threads with 100% verified quotes.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="rounded bg-blue-950/70 border border-blue-800/60 px-3 py-1 font-mono text-blue-300">
            {decisions.length} decisions • {discussions.length} discussions indexed
          </span>
        </div>
      </div>

      {/* Top Bar: Ingest Any GitHub Repo or PR */}
      <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-4 shadow-xl">
        <form onSubmit={handleInlineIngest} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400 text-sm">
              🔗
            </span>
            <input
              type="text"
              placeholder="Paste any GitHub repository link or specific PR URL (e.g. huggingface/diffusers or https://github.com/.../pull/15107)..."
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              disabled={loadingRepo}
              className="w-full rounded-lg bg-gray-900 border border-gray-700/80 pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loadingRepo || !repoInput.trim()}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 text-sm font-semibold shrink-0 disabled:opacity-50 transition shadow-lg shadow-emerald-900/40"
          >
            {loadingRepo ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Ingesting & Extracting...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Load Repo / PR</span>
              </>
            )}
          </button>
        </form>

        {ingestBanner && (
          <div
            className={`mt-3 rounded-lg p-3 text-xs border ${
              ingestBanner.success
                ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
                : 'bg-red-950/70 border-red-800/80 text-red-300'
            }`}
          >
            {ingestBanner.message}
          </div>
        )}
      </div>

      {/* Primary Section Switcher: Main Section (Active/New Data) vs Previous Data Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-800 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSectionMode('main')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition border ${
              sectionMode === 'main'
                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40'
                : 'bg-[#0e1424] text-gray-400 hover:text-white border-gray-800 hover:border-gray-700'
            }`}
          >
            <span>⚡ Main Section: Active Data</span>
            {currentRepo && (
              <span className="rounded bg-blue-950/90 border border-blue-400/50 px-2 py-0.5 text-xs text-blue-200 font-mono">
                {currentRepo}
              </span>
            )}
          </button>

          <button
            onClick={() => setSectionMode('previous')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition border ${
              sectionMode === 'previous'
                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40'
                : 'bg-[#0e1424] text-gray-400 hover:text-white border-gray-800 hover:border-gray-700'
            }`}
          >
            <span>📂 Previous Data</span>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 font-mono">
              {previousRepos.length} repos
            </span>
          </button>
        </div>

        {sectionMode === 'main' && currentRepo && (
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Active Repository: <strong className="text-white font-mono">{currentRepo}</strong></span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2: PREVIOUS DATA SECTION (Organized Previous Repositories) */}
      {/* ------------------------------------------------------------------ */}
      {sectionMode === 'previous' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-[#0e1424] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>📂 Previously Ingested Repositories</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Historical decisions and discussions from earlier repository ingestions. Click "Make Active" to load any into the Main Section.
                </p>
              </div>
              {selectedPrevRepo && (
                <button
                  onClick={() => setSelectedPrevRepo('')}
                  className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  Show All Previous Repositories
                </button>
              )}
            </div>

            {previousRepos.length === 0 ? (
              <div className="p-8 text-center rounded-lg border border-dashed border-gray-800 text-sm text-gray-400">
                No previous repositories yet. As you load new repositories above, earlier repositories will be archived here!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {previousRepos.map((repo) => {
                  const repoDecs = decisions.filter((d) => d.repo_or_forum === repo || d.thread_id.includes(repo)).length;
                  const repoDiscs = discussions.filter((d) => d.thread_id.includes(repo) || d.url.includes(repo)).length;
                  const isSelected = selectedPrevRepo === repo;
                  return (
                    <div
                      key={repo}
                      className={`rounded-lg border p-3.5 transition space-y-2.5 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-950/20'
                          : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold text-white truncate max-w-[190px]">
                          {repo}
                        </span>
                        <span className="rounded bg-blue-950 px-2 py-0.5 text-[11px] font-mono text-blue-300 border border-blue-800/60">
                          {repoDecs} dec • {repoDiscs} disc
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 pt-1 border-t border-gray-800">
                        <button
                          onClick={() => {
                            setActiveRepo(repo);
                            setSectionMode('main');
                          }}
                          className="flex-1 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 py-1 text-xs font-semibold text-blue-300 transition text-center"
                        >
                          ⚡ Make Active
                        </button>
                        <button
                          onClick={() => setSelectedPrevRepo(isSelected ? '' : repo)}
                          className="rounded bg-gray-800 hover:bg-gray-700 py-1 px-2.5 text-xs font-medium text-gray-300 transition"
                        >
                          {isSelected ? 'Reset' : 'Browse'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-View Switcher Tabs: Decisions vs Discussions */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div className="flex space-x-3">
          <button
            onClick={() => setViewMode('decisions')}
            className={`flex items-center space-x-2 pb-2 px-1 text-sm font-semibold transition border-b-2 ${
              viewMode === 'decisions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>🏛️ Architectural Decisions</span>
            <span className="rounded-full bg-blue-950/80 border border-blue-800/60 px-2 py-0.5 text-xs text-blue-300">
              {currentDecisions.length}
            </span>
          </button>

          <button
            onClick={() => setViewMode('discussions')}
            className={`flex items-center space-x-2 pb-2 px-1 text-sm font-semibold transition border-b-2 ${
              viewMode === 'discussions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>💬 Discussion Threads</span>
            <span className="rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 text-xs text-emerald-300">
              {filteredDiscussions.length}
            </span>
          </button>
        </div>

        <span className="hidden sm:inline-block text-xs text-gray-500 font-mono">
          {sectionMode === 'main' ? `⚡ Active: ${currentRepo || 'All'}` : `📂 Previous Data`}
        </span>
      </div>

      {/* Universal Search and Filter Bar */}
      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#0e1424] p-3.5 rounded-xl border border-gray-800">
        <div className={viewMode === 'decisions' ? "md:col-span-6" : "md:col-span-9"}>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-500 text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder={
                viewMode === 'decisions'
                  ? "Search decisions by PR #, title keyword, rationale, or paste PR link..."
                  : "Search discussions by PR #, title keyword, or paste PR link..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg bg-gray-900 border border-gray-700/80 pl-9 pr-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {viewMode === 'decisions' ? (
          <>
            <div className="md:col-span-3">
              <select
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
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
                className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition shrink-0"
              >
                Filter
              </button>
            </div>
          </>
        ) : (
          <div className="md:col-span-3 flex space-x-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition"
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
                className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition"
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
            <div className="lg:col-span-7 space-y-4">
              {loading ? (
                <div className="flex h-48 items-center justify-center rounded-xl border border-gray-800 bg-[#0e1424]">
                  <span className="text-sm text-gray-400">Loading verified decisions...</span>
                </div>
              ) : currentDecisions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-gray-800 bg-[#0e1424]/50">
                  <span className="text-3xl mb-2">🔍</span>
                  <p className="text-sm font-medium text-gray-300">
                    {sectionMode === 'main' && currentRepo
                      ? `No decisions extracted for "${currentRepo}" yet.`
                      : 'No decisions match your search criteria.'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Paste any GitHub repository link or specific PR URL in the top bar to ingest and extract decisions.
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
              <div className="sticky top-20 rounded-xl border border-gray-800 bg-[#0e1424] p-5 space-y-5">
                {activeDecision ? (
                  <>
                    <div className="border-b border-gray-800 pb-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <OutcomeBadge outcome={activeDecision.outcome} />
                        <PlatformBadge platform={activeDecision.repo_or_forum} />
                        <ConfidenceBadge confidence={activeDecision.confidence} />
                      </div>
                      <h2 className="text-lg font-bold text-white leading-snug">
                        {activeDecision.title}
                      </h2>
                      <div className="mt-2 text-xs font-mono text-gray-400 flex items-center justify-between">
                        <span>Thread: {activeDecision.thread_id}</span>
                        <button
                          onClick={() => {
                            setViewMode('discussions');
                            selectDiscussion(activeDecision.thread_id);
                          }}
                          className="text-blue-400 hover:text-blue-300 underline font-sans text-xs"
                        >
                          💬 View Full Thread
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Architectural Rationale
                      </h4>
                      <p className="text-sm text-gray-200 leading-relaxed bg-gray-900/60 p-3 rounded-lg border border-gray-800/60">
                        {activeDecision.rationale}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                        Verified Evidence Quotes ({activeDecision.evidence.length})
                      </h4>
                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {activeDecision.evidence.map((ev, idx) => (
                          <QuoteViewer key={idx} evidence={ev} label={`Citation #${idx + 1}`} />
                        ))}
                      </div>
                    </div>

                    {activeDecision.alternatives && activeDecision.alternatives.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2">
                          Rejected Alternatives ({activeDecision.alternatives.length})
                        </h4>
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {activeDecision.alternatives.map((alt, idx) => (
                            <div key={idx} className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 text-xs">
                              <div className="font-semibold text-rose-300">Proposal: {alt.text}</div>
                              <div className="text-gray-300 my-1"><span className="text-gray-400 font-medium">Reason: </span>{alt.reason}</div>
                              {alt.evidence && <QuoteViewer evidence={alt.evidence} label="Proposal Quote" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-gray-800/80 text-xs text-gray-400 flex justify-between items-center">
                      <span>Model: <span className="font-mono text-gray-300">{activeDecision.extractor_model}</span></span>
                      <span>Decided: {activeDecision.decided_at ? new Date(activeDecision.decided_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-sm text-gray-500">
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
              <div className="flex h-48 items-center justify-center rounded-xl border border-gray-800 bg-[#0e1424]">
                <span className="text-sm text-gray-400">Loading discussion threads...</span>
              </div>
            ) : filteredDiscussions.length === 0 ? (
              isPrQuery ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-blue-700/80 bg-blue-950/30 space-y-3">
                  <span className="text-3xl">🔗</span>
                  <p className="text-sm font-medium text-blue-200">
                    Found a GitHub PR link in your search!
                  </p>
                  <p className="text-xs text-gray-400 font-mono max-w-md mx-auto truncate">
                    {searchQuery.trim()}
                  </p>
                  <button
                    onClick={() => executeIngest(searchQuery.trim())}
                    disabled={loadingRepo}
                    className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 text-xs font-semibold shadow-lg shadow-emerald-900/40"
                  >
                    {loadingRepo ? <span>⏳ Loading PR...</span> : <span>🚀 Ingest & Display PR Discussion</span>}
                  </button>
                </div>
              ) : (
                <div className="p-12 text-center rounded-xl border border-dashed border-gray-800 bg-[#0e1424]">
                  <p className="text-sm text-gray-400">
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
                      className="mt-3 text-xs text-blue-400 underline hover:text-blue-300"
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
                    className={`cursor-pointer rounded-xl border p-4 transition ${
                      isSelected
                        ? 'border-blue-500/80 bg-blue-950/20 shadow-md'
                        : 'border-gray-800 bg-[#0e1424] hover:border-gray-700 hover:bg-[#121a30]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="rounded bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 text-[11px] font-semibold uppercase">
                          {disc.platform.replace('github_', '').replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          {new Date(disc.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-mono text-gray-300 flex items-center space-x-1">
                        <span>💬</span>
                        <span>{disc.comment_count} comments</span>
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white leading-snug">
                      {disc.title}
                    </h3>

                    <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-gray-800/60">
                      <span className="text-gray-500 font-mono truncate max-w-[280px]">
                        {disc.thread_id}
                      </span>
                      <a
                        href={disc.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-400 hover:text-blue-300 underline flex items-center space-x-1 font-medium"
                      >
                        <span>Open on GitHub</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Full Discussion Detail & Comments */}
          <div className="lg:col-span-5">
            <div className="sticky top-20 rounded-xl border border-gray-800 bg-[#0e1424] p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              {loadingDiscussionDetail ? (
                <div className="p-8 text-center text-sm text-gray-400">Loading thread comments...</div>
              ) : activeDiscussion ? (
                <>
                  <div className="border-b border-gray-800 pb-3">
                    <div className="flex items-center space-x-2 text-xs text-gray-400 mb-1">
                      <span className="uppercase text-blue-400 font-semibold">{activeDiscussion.platform}</span>
                      <span>•</span>
                      <span>{new Date(activeDiscussion.created_at).toLocaleString()}</span>
                    </div>
                    <h2 className="text-base font-bold text-white leading-snug">
                      {activeDiscussion.title}
                    </h2>
                    <a
                      href={activeDiscussion.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      <span>View Original Thread on GitHub</span>
                      <span>↗</span>
                    </a>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Thread Comments ({activeDiscussion.comments.length})
                    </h4>

                    {activeDiscussion.comments.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-500">
                        No discussion comments found in this thread.
                      </div>
                    ) : (
                      activeDiscussion.comments.map((comment) => (
                        <div
                          key={comment.comment_id}
                          className="rounded-lg border border-gray-800/80 bg-gray-900/50 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-blue-300 font-mono">
                              @{comment.author_handle}
                            </span>
                            <span className="text-gray-500 text-[11px]">
                              {new Date(comment.posted_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                            {comment.body}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-sm text-gray-500">
                  Select a discussion thread on the left to read its full comment chain and review discussions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
