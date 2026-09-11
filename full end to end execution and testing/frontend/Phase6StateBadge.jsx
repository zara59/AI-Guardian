// Phase 6: workflow state badge.
// Displays the derived Phase 6 execution state with an honest color.

import { CheckCircle2, XCircle, CircleDot, Loader2, Moon } from 'lucide-react';

const GOOD = new Set(['verified', 'confirmed']);
const BAD = new Set(['rejected', 'expired', 'invalidated', 'keeperhub_failed', 'transaction_failed', 'verification_failed', 'insufficient_funds']);
const RUNNING = new Set(['submitted_to_keeperhub', 'keeperhub_executing', 'transaction_submitted', 'approved']);

export function stateTone(state) {
  if (GOOD.has(state)) return 'good';
  if (BAD.has(state)) return 'bad';
  if (RUNNING.has(state)) return 'running';
  return 'neutral';
}

const LABELS = {
  draft: 'Draft',
  ranked: 'Ranked',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  submitted_to_keeperhub: 'Submitted to KeeperHub',
  keeperhub_executing: 'KeeperHub executing',
  transaction_submitted: 'Transaction submitted',
  confirmed: 'Confirmed',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
  invalidated: 'Invalidated',
  keeperhub_failed: 'KeeperHub failed',
  transaction_failed: 'Transaction failed',
  verification_failed: 'Verification failed',
  insufficient_funds: 'Insufficient funds',
};

const TONE_STYLES = {
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  bad: 'border-red-500/40 bg-red-500/10 text-red-200',
  running: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  neutral: 'border-slate-600 bg-slate-800 text-slate-300',
};

export default function Phase6StateBadge({ state, hint }) {
  const tone = stateTone(state);
  const Icon =
    tone === 'good' ? CheckCircle2
      : tone === 'bad' ? XCircle
        : tone === 'running' ? Loader2
          : CircleDot;
  return (
    <span
      title={hint || state}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      <Icon className="h-3 w-3" />
      {LABELS[state] || state}
    </span>
  );
}

export function Phase6Idle() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Moon className="h-3 w-3" /> No execution started
    </span>
  );
}