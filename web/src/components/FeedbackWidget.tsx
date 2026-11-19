import React, { useState } from 'react';
import { submitFeedback } from '../lib/api';

interface FeedbackWidgetProps {
  decisionId: string;
  path: string;
  onFeedbackSubmitted?: (verdict: string) => void;
}

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({
  decisionId,
  path,
  onFeedbackSubmitted,
}) => {
  const [selectedVerdict, setSelectedVerdict] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = async (verdict: 'relevant' | 'not_relevant' | 'outdated') => {
    setSelectedVerdict(verdict);
    setSubmitting(true);
    try {
      await submitFeedback({
        decision_id: decisionId,
        path: path || 'default',
        verdict,
        note: note || undefined,
      });
      setSubmitted(true);
      if (onFeedbackSubmitted) onFeedbackSubmitted(verdict);
    } catch (e) {
      console.warn('Feedback submission error', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-2.5 text-xs text-emerald-300 flex items-center justify-between">
        <span className="flex items-center space-x-1.5 font-mono text-[11px]">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            Feedback recorded: <strong className="text-white capitalize">{selectedVerdict?.replace('_', ' ')}</strong>. Memory weights updated!
          </span>
        </span>
        <button
          onClick={() => setSubmitted(false)}
          className="text-slate-400 hover:text-white underline text-[11px] font-mono ml-2"
        >
          Adjust
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#1b253b] bg-[#090d16] p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] text-slate-300 font-medium">Maintainer Feedback Loop</span>
        <span className="text-[10px] text-slate-500 font-mono">Calibrate memory</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        <button
          disabled={submitting}
          onClick={() => handleSelect('relevant')}
          className="flex-1 rounded border border-emerald-800/40 bg-emerald-950/20 hover:bg-emerald-950/40 px-2.5 py-1 text-[11px] font-mono font-medium text-emerald-300 transition-colors"
        >
          Relevant
        </button>
        <button
          disabled={submitting}
          onClick={() => handleSelect('not_relevant')}
          className="flex-1 rounded border border-slate-700/50 bg-[#121927] hover:bg-[#182338] px-2.5 py-1 text-[11px] font-mono font-medium text-slate-300 transition-colors"
        >
          Not Relevant
        </button>
        <button
          disabled={submitting}
          onClick={() => handleSelect('outdated')}
          className="flex-1 rounded border border-amber-800/40 bg-amber-950/20 hover:bg-amber-950/40 px-2.5 py-1 text-[11px] font-mono font-medium text-amber-300 transition-colors"
        >
          Outdated
        </button>
      </div>

      <input
        type="text"
        placeholder="Optional rationale note (e.g. superseded in v2.4)..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded border border-[#1a2337] bg-[#07090f] px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
      />
    </div>
  );
};
