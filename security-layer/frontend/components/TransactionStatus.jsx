import { Check, Loader2, ExternalLink } from 'lucide-react';
import { computeSteps, stepStates, explorerTxUrl } from '../services/transactionStatus';
import { PHASES } from '../hooks/useTransaction';

function StepRow({ step }) {
  if (step.state === 'done') {
    return (
      <li className="flex items-center gap-3 text-sm">
        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <Check size={12} />
        </span>
        <span className="text-slate-700">{step.label}</span>
      </li>
    );
  }
  if (step.state === 'active') {
    return (
      <li className="flex items-center gap-3 text-sm">
        <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <Loader2 size={12} className="animate-spin" />
        </span>
        <span className="font-medium text-brand-700">{step.label}</span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 text-[10px]">
        ○
      </span>
      <span className="text-slate-400">{step.label}</span>
    </li>
  );
}

/**
 * Live status stepper for a prepared/signed/confirmed Guardian transaction.
 * Pure presentational — the transaction hook owns the state.
 */
export default function TransactionStatus({
  phase,
  type,
  needsApproval,
  approvalHash,
  txHash,
  hasReceipt,
  chainId,
  busyLabel,
}) {
  const steps = computeSteps({ type, needsApproval });
  const states = stepStates({
    phase,
    steps,
    edge: { approvalHash, hasTxHash: Boolean(txHash), hasReceipt },
  });

  const link = txHash ? explorerTxUrl(chainId, txHash) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        {[PHASES.approving, PHASES.awaitingApproval, PHASES.signing, PHASES.signed, PHASES.awaitingConfirmation, PHASES.verifying].includes(phase) && (
          <Loader2 size={15} className="animate-spin text-brand-600" />
        )}
        <h4 className="text-sm font-semibold text-slate-900">
          {busyLabel || 'Execution in progress'}
        </h4>
      </div>
      <ol className="space-y-3">
        {states.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ol>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
        >
          View on Etherscan <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}