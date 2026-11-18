import React from 'react';
import { Evidence } from '../lib/mockData';

interface QuoteViewerProps {
  evidence: Evidence;
  label?: string;
}

export const QuoteViewer: React.FC<QuoteViewerProps> = ({ evidence, label = 'Verbatim Verified Citation' }) => {
  const formattedDate = evidence.posted_at
    ? new Date(evidence.posted_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown date';

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1322] p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center space-x-1.5 text-xs font-semibold text-blue-400">
          <span>💬</span>
          <span>{label}</span>
        </span>
        <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-800/60">
          ✓ RapidFuzz ≥ 95% Verified
        </span>
      </div>

      <blockquote className="border-l-2 border-blue-500/60 pl-3 font-mono text-xs text-gray-200 leading-relaxed italic my-2">
        "{evidence.quote}"
      </blockquote>

      <div className="mt-2.5 flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-800/60">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-gray-300">@{evidence.author_handle}</span>
          <span className="text-gray-600">•</span>
          <span>{formattedDate}</span>
        </div>
        {evidence.source_url && (
          <a
            href={evidence.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 underline font-mono text-[11px]"
          >
            <span>View Source</span>
            <span>↗</span>
          </a>
        )}
      </div>
    </div>
  );
};
