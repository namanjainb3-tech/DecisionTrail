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
      console.error('Feedback submission failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded border border-emerald-800/60 bg-emerald-950/40 p-2 text-xs text-emerald-300 flex items-center justify-between">
        <span className="flex items-center space-x-1.5">
          <span>✓</span>
          <span>
            Feedback recorded: <strong>{selectedVerdict}</strong>. DecisionTrail memory updated!
          </span>
        </span>
        <button
          onClick={() => setSubmitted(false)}
          className="text-gray-400 hover:text-gray-200 underline text-[11px]"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1322] p-3 text-xs">
      <div className="mb-2 font-medium text-gray-300">Maintainer Feedback Hook</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleSelect('relevant')}
          disabled={submitting}
          className="flex items-center space-x-1 rounded bg-emerald-900/40 border border-emerald-700/60 px-2.5 py-1 text-emerald-300 hover:bg-emerald-800/50 transition font-medium disabled:opacity-50"
        >
          <span>👍</span>
          <span>Relevant (+0.5)</span>
        </button>
        <button
          onClick={() => handleSelect('not_relevant')}
          disabled={submitting}
          className="flex items-center space-x-1 rounded bg-rose-900/40 border border-rose-700/60 px-2.5 py-1 text-rose-300 hover:bg-rose-800/50 transition font-medium disabled:opacity-50"
        >
          <span>👎</span>
          <span>Not Relevant (-1.0)</span>
        </button>
        <button
          onClick={() => handleSelect('outdated')}
          disabled={submitting}
          className="flex items-center space-x-1 rounded bg-amber-900/40 border border-amber-700/60 px-2.5 py-1 text-amber-300 hover:bg-amber-800/50 transition font-medium disabled:opacity-50"
        >
          <span>⚠️</span>
          <span>Outdated (Hide)</span>
        </button>
      </div>
    </div>
  );
};

