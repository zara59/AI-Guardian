// Phase 5: KeeperHub execution status stepper.
//
// Shows real-time progress of a KeeperHub execution:
//
//  Workflow reviewed → Workflow approved → Submitting to KeeperHub →
//  KeeperHub executing → Transaction pending → Blockchain confirmed →
//  State verified
//
// Displays KeeperHub execution ID, transaction hash with explorer link,
// and KeeperHub status as they become available. NEVER shows success before
// the final state.

import { Check, Loader2, Clock, Network, ShieldCheck } from 'lucide-react';
import { khExplorerTxUrl, shortAddress, khStatusLabel, computeKhSteps } from '../services/keeperHubStatus.js';

export default function KeeperHubTransactionStatus({ phase, workflow, khStatus, onPoll }) {
  const txHash = workflow?.txHash;
  const hasExecutionId = Boolean(workflow?.khExecutionId);
  const hasTxHash = Boolean(txHash);
  const approved = Boolean(workflow?.approved);

  const submitted = !['created', 'approved', 'idle'].includes(phase) && Boolean(hasExecutionId || hasTxHash || workflow?.finalState);

  const steps = computeKhSteps({ approved, submitted, hasExecutionId, hasTxHash, verified: workflow?.finalState === 'confirmed' });

  const explorer = txHash ? khExplorerTxUrl(workflow?.chainId, txHash) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Network size={16} className="text-brand-600" />
        <h4 className="text-sm font-semibold text-slate-900">KeeperHub Controlled Execution</h4>
      </div>

      <ol className="space-y-2.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3">
            <StepIcon state={step.done ? 'done' : step.active ? 'active' : 'pending'} />
            <span
              className={`text-sm ${
                step.done ? 'text-slate-900 font-medium' : step.active ? 'text-slate-700' : 'text-slate-400'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {workflow?.khExecutionId && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">KeeperHub execution</span>
          <span className="font-mono text-xs text-slate-700">{shortAddress(workflow.khExecutionId, 12, 6)}</span>
        </div>
      )}

      {/* Never imply final success at an intermediate step. */}
      {khStatus && workflow?.finalState !== 'confirmed' && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Loader2 size={13} className="animate-spin text-brand-600" />
          KeeperHub status: <span className="font-medium">{khStatusLabel(khStatus)}</span>
          {typeof onPoll === 'function' && (
            <button
              onClick={onPoll}
              className="ml-auto text-brand-600 hover:text-brand-700 font-medium"
            >
              Refresh
            </button>
          )}
        </div>
      )}

      {explorer && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-xs text-slate-500">Transaction</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-700">{shortAddress(txHash, 8, 6)}</span>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Explorer →
            </a>
          </div>
        </div>
      )}

      {workflow?.finalState === 'confirmed' && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <ShieldCheck size={13} />
          Confirmed on-chain. Blockchain receipt and vault state verified.
        </div>
      )}
    </div>
  );
}

function StepIcon({ state }) {
  if (state === 'done') {
    return (
      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
        <Check size={13} />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
        <Loader2 size={13} className="animate-spin" />
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
      <Clock size={13} />
    </span>
  );
}