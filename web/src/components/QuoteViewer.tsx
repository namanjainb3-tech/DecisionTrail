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
    : 'Archived date';

  return (
    <div className="rounded-lg border border-[#1b2438] bg-[#090d16] p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <span className="flex items-center space-x-1.5 text-[11px] font-mono font-medium text-sky-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{label}</span>
        </span>
        <span className="inline-flex items-center space-x-1 rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-800/50">
          <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>RapidFuzz ≥ 95% Match</span>
        </span>
      </div>

      <blockquote className="border-l-2 border-sky-500/70 pl-3 font-mono text-[11px] text-slate-200 leading-relaxed my-2 select-text">
        "{evidence.quote}"
      </blockquote>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-[#161f30]">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-slate-300">@{evidence.author_handle}</span>
          <span className="text-slate-600">•</span>
          <span>{formattedDate}</span>
        </div>
        {evidence.source_url && (
          <a
            href={evidence.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 text-sky-400 hover:text-sky-300 font-mono text-[11px] transition-colors"
          >
            <span>Source</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
};
