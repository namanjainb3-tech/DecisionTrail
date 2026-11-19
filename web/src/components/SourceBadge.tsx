import React from 'react';

export const OutcomeBadge: React.FC<{ outcome?: string }> = ({ outcome }) => {
  const norm = (outcome || 'adopted').toLowerCase();

  const styles: Record<string, string> = {
    adopted: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
    rejected: 'bg-rose-950/60 text-rose-400 border-rose-800/60',
    reverted: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
    deferred: 'bg-slate-900 text-slate-400 border-slate-700/60',
  };

  const style = styles[norm] || styles.deferred;

  return (
    <span className={`inline-flex items-center space-x-1.5 rounded px-2 py-0.5 text-[11px] font-mono font-medium border ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
      <span className="capitalize">{norm}</span>
    </span>
  );
};

export const PlatformBadge: React.FC<{ platform?: string }> = ({ platform }) => {
  const norm = (platform || '').toLowerCase();

  let label = platform || 'Source';
  let color = 'bg-[#101624] text-slate-300 border-[#1c273c]';

  if (norm.includes('github') || norm.includes('issue') || norm.includes('pr')) {
    label = norm.includes('pr') ? 'GitHub PR' : norm.includes('review') ? 'GitHub Review' : 'GitHub Issue';
    color = 'bg-[#0f172a] text-slate-300 border-[#1e293b]';
  } else if (norm.includes('discourse') || norm.includes('discuss') || norm.includes('pep')) {
    label = 'Discourse';
    color = 'bg-[#141829] text-sky-300 border-[#222947]';
  }

  return (
    <span className={`inline-flex items-center space-x-1 rounded px-2 py-0.5 text-[11px] font-mono font-medium border ${color}`}>
      <span>{label}</span>
    </span>
  );
};

export const ConfidenceBadge: React.FC<{ confidence?: number }> = ({ confidence }) => {
  if (confidence === undefined || confidence === null) return null;
  const pct = Math.round(confidence * 100);

  return (
    <span className="inline-flex items-center space-x-1 rounded bg-[#0d1524] border border-[#1d2a45] px-2 py-0.5 text-[11px] font-mono text-sky-400">
      <span className="text-slate-500">conf:</span>
      <span className="font-semibold">{pct}%</span>
    </span>
  );
};
