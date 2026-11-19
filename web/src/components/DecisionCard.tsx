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
      className={`rounded-xl border transition-all p-5 ${
        selected
          ? 'border-blue-500 bg-gray-900/90 shadow-lg shadow-blue-500/10'
          : 'border-gray-800 bg-[#0e1424]/90 hover:border-gray-700 hover:bg-[#11192e]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={decision.outcome} />
          <PlatformBadge platform={decision.repo_or_forum} />
          <ConfidenceBadge confidence={decision.confidence} />
        </div>
        <span className="text-xs font-mono text-gray-500">
          ID: {decision.id.substring(0, 16)}...
        </span>
      </div>

      <h3
        onClick={() => onSelect && onSelect(decision)}
        className="text-base font-semibold text-white hover:text-blue-400 cursor-pointer transition mb-2"
      >
        {decision.title}
      </h3>

      <p className="text-sm text-gray-300 leading-relaxed mb-4">
        {decision.rationale}
      </p>

      {/* Primary Evidence */}
      {primaryEvidence && (
        <div className="mb-4">
          <QuoteViewer evidence={primaryEvidence} label="Primary Decision Quote" />
        </div>
      )}

      {/* Rejected Alternatives */}
      {decision.alternatives && decision.alternatives.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800/80">
          <button
            onClick={() => setShowAlts(!showAlts)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
          >
            <span>{showAlts ? '▼' : '▶'}</span>
            <span>
              Rejected Alternatives ({decision.alternatives.length})
            </span>
          </button>

          {showAlts && (
            <div className="mt-2.5 space-y-3">
              {decision.alternatives.map((alt, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-rose-950/60 bg-rose-950/20 p-3 text-xs"
                >
                  <div className="font-semibold text-rose-300 mb-1">
                    ❌ Proposal: {alt.text}
                  </div>
                  <div className="text-gray-300 mb-2">
                    <span className="font-medium text-gray-400">Why Rejected: </span>
                    {alt.reason}
                  </div>
                  {alt.evidence && (
                    <QuoteViewer
                      evidence={alt.evidence}
                      label={`Alternative Quote #${idx + 1}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Linked paths */}
      {decision.linked_paths && decision.linked_paths.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-800/60 text-xs">
          <span className="text-gray-500 font-mono">Affects:</span>
          {decision.linked_paths.map((p) => (
            <span
              key={p}
              className="rounded bg-gray-800/80 px-2 py-0.5 font-mono text-[11px] text-gray-300 border border-gray-700/60"
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

