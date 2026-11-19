import React, { useState, useEffect } from 'react';
import { fetchDecisions } from '../lib/api';
import { Decision } from '../lib/mockData';
import { DecisionCard } from '../components/DecisionCard';
import { OutcomeBadge, PlatformBadge, ConfidenceBadge } from '../components/SourceBadge';
import { QuoteViewer } from '../components/QuoteViewer';

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [activeDecision, setActiveDecision] = useState<Decision | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchDecisions({
        q: searchQuery || undefined,
        outcome: selectedOutcome || undefined,
        path: selectedPath || undefined,
      });
      setDecisions(data);
      if (data.length > 0 && !activeDecision) {
        setActiveDecision(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedOutcome]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Architectural Decisions Catalog</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Unrecorded engineering decisions extracted from PRs, issues, and forum threads with 100% verified quotes.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="rounded bg-blue-950/70 border border-blue-800/60 px-3 py-1 font-mono text-blue-300">
            {decisions.length} decisions indexed
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-[#0e1424] p-3.5 rounded-xl border border-gray-800">
        <div className="md:col-span-6">
          <input
            type="text"
            placeholder="Search decisions, rationales, rejected proposals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
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
      </form>

      {/* Content Layout: List + Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Decision Cards */}
        <div className="lg:col-span-7 space-y-4">
          {loading ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-gray-800 bg-[#0e1424]">
              <span className="text-sm text-gray-400">Loading verified decisions...</span>
            </div>
          ) : decisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-gray-800 bg-[#0e1424]/50">
              <span className="text-3xl mb-2">🔍</span>
              <p className="text-sm font-medium text-gray-300">No decisions match your search criteria</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedOutcome('');
                  setSelectedPath('');
                  fetchDecisions().then(setDecisions);
                }}
                className="mt-3 text-xs text-blue-400 underline hover:text-blue-300"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            decisions.map((dec) => (
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
                  <div className="mt-2 text-xs font-mono text-gray-500">
                    Thread ID: {activeDecision.thread_id}
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
  );
}

