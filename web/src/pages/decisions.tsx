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

          </div>
  );
}
