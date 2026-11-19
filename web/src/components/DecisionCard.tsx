import React, { useState } from 'react';
import { Decision } from '../lib/mockData';
import { OutcomeBadge, PlatformBadge, ConfidenceBadge } from './SourceBadge';
import { QuoteViewer } from './QuoteViewer';

interface DecisionCardProps {
  decision: Decision;
  onSelect?: (decision: Decision) => void;
  selected?: boolean;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({
  decision,
  onSelect,
  selected = false,
}) => {
  const [showAlts, setShowAlts] = useState(false);

  const primaryEvidence = decision.evidence[0];

  return (
    <div
      className={`rounded-xl border transition-all duration-150 p-4 sm:p-5 ${
        selected
          ? 'border-sky-500 bg-[#0e1422] shadow-sm'
          : 'border-[#1a2336] bg-[#0a0e17] hover:border-[#27344f] hover:bg-[#0c111c]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <OutcomeBadge outcome={decision.outcome} />
          <PlatformBadge platform={decision.repo_or_forum} />
          <ConfidenceBadge confidence={decision.confidence} />
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          ID: {decision.id.substring(0, 14)}...
        </span>
      </div>

      <h3
        onClick={() => onSelect && onSelect(decision)}
        className="text-sm sm:text-base font-semibold text-white hover:text-sky-400 cursor-pointer transition-colors duration-150 mb-2 leading-snug"
      >
        {decision.title}
      </h3>

      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
        {decision.rationale}
      </p>

      {/* Primary Evidence */}
      {primaryEvidence && (
        <div className="mb-3">
          <QuoteViewer evidence={primaryEvidence} label="Primary Decision Quote" />
        </div>
      )}

      {/* Rejected Alternatives */}
      {decision.alternatives && decision.alternatives.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#161f30]">
          <button
            onClick={() => setShowAlts(!showAlts)}
            className="flex items-center space-x-1.5 text-xs font-mono font-medium text-rose-400 hover:text-rose-300 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 transform transition-transform ${showAlts ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>
              Rejected Alternatives ({decision.alternatives.length})
            </span>
          </button>

          {showAlts && (
            <div className="mt-2.5 space-y-2.5">
              {decision.alternatives.map((alt, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-rose-950/60 bg-rose-950/20 p-3 text-xs space-y-1.5"
                >
                  <div className="font-semibold text-rose-300 flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    <span>Proposed: {alt.text}</span>
                  </div>
                  <div className="text-slate-300 text-[11px] leading-relaxed">
                    <span className="text-slate-400 font-medium">Rejection Rationale: </span>
                    {alt.reason}
                  </div>
                  {alt.evidence && (
                    <div className="pt-1">
                      <QuoteViewer
                        evidence={alt.evidence}
                        label={`Alternative Citation #${idx + 1}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Linked paths */}
      {decision.linked_paths && decision.linked_paths.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#161f30] text-xs">
          <span className="text-slate-500 font-mono text-[11px]">Affects:</span>
          {decision.linked_paths.map((p) => (
            <span
              key={p}
              className="inline-flex items-center space-x-1 rounded bg-[#101726] px-2 py-0.5 font-mono text-[10px] text-slate-300 border border-[#1d273a]"
            >
              <svg className="w-2.5 h-2.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{p}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
