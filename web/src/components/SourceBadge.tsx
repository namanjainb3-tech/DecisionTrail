import React from 'react';

interface SourceBadgeProps {
  platform?: string;
  outcome?: 'adopted' | 'rejected' | 'reverted' | 'deferred' | string;
  confidence?: number;
}

export const OutcomeBadge: React.FC<{ outcome?: string }> = ({ outcome }) => {
  const norm = (outcome || 'adopted').toLowerCase();

  const styles: Record<string, string> = {
    adopted: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    rejected: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
    reverted: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
    deferred: 'bg-gray-800 text-gray-300 border-gray-600',
  };

  const icons: Record<string, string> = {
    adopted: '✓ Adopted',
    rejected: '✗ Rejected',
    reverted: '↺ Reverted',
    deferred: '⏳ Deferred',
  };

  const style = styles[norm] || styles.deferred;
  const label = icons[norm] || outcome || 'Unknown';

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
};

export const PlatformBadge: React.FC<{ platform?: string }> = ({ platform }) => {
  const norm = (platform || '').toLowerCase();

  let label = 'Source';
  let color = 'bg-gray-800 text-gray-300 border-gray-700';

  if (norm.includes('github') || norm.includes('issue') || norm.includes('pr')) {
    label = 'GitHub';
    color = 'bg-slate-800 text-slate-200 border-slate-700';
  } else if (norm.includes('discourse') || norm.includes('discuss')) {
    label = 'Discourse';
    color = 'bg-indigo-950 text-indigo-300 border-indigo-800';
  }

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
};

export const ConfidenceBadge: React.FC<{ confidence?: number }> = ({ confidence }) => {
  if (confidence === undefined || confidence === null) return null;
  const pct = Math.round(confidence * 100);

  return (
    <span className="inline-flex items-center space-x-1 rounded bg-blue-950/70 border border-blue-800/60 px-2 py-0.5 text-xs font-mono font-medium text-blue-300">
      <span>conf:</span>
      <span className="font-bold">{pct}%</span>
    </span>
  );
};

