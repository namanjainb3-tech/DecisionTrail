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

          </div>
  );
};
