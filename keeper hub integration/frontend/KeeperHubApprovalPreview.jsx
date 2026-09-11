// Phase 5: KeeperHub approval preview + execution flow.
//
// The user-facing Phase 5 experience:
//
//  1. Review the exact workflow (opportunity, amount, network, contract,
//     operation, hash, expiration).
//  2. Approve This Workflow  (explicit authorization).
//  3. Send Approved Workflow to KeeperHub  (execution).
//  4. Track KeeperHub execution → transaction → verified state.

import { useRef } from 'react';
import {
  Lock,
  Check,
  Send,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  RefreshCcw,
  AlertTriangle,
  FileText,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useWallet } from '../../security-layer/frontend/hooks/useWallet.js';
import { useKeeperHubTransaction, KH_PHASES } from './useKeeperHubTransaction.js';
import KeeperHubTransactionStatus from './KeeperHubTransactionStatus.jsx';
import { khExplorerTxUrl, shortAddress } from './status.js';
import { formatCurrency } from '../../frontend/src/utils/formatting';

export default function KeeperHubApprovalPreview({ opportunity, amount, riskPreference, wallet }) {
  const actions = useWallet();
  const {
    workflow,
    approvalId,
    warnings,
    txHash,
    verification,
    phase,
    error,
    isBusy,
    prepare,
    approve,
    sendToKeeperHub,
    poll,
    reset,
  } = useKeeperHubTransaction(opportunity);

  const previousAmount = useRef(amount);
  if (previousAmount.current !== amount && phase === KH_PHASES.reviewing) {
    previousAmount.current = amount;
    reset();
  }

  const address = wallet?.address || actions?.address;

  // ---- Failure state -----------------------------------------------------
  if (phase === KH_PHASES.failed && error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2 text-red-700">
          <ShieldAlert size={16} />
          <h4 className="text-sm font-semibold">Execution stopped</h4>
        </div>
        <p className="text-sm text-slate-600 mb-1">{error.message}</p>
        <p className="text-xs text-slate-400 mb-4">
          {error.code ? `Code: ${error.code}` : ''}
          {' · Nothing was executed unless the blockchain already confirmed it.'}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <RefreshCcw size={14} />
          Start over
        </button>
      </div>
    );
  }

  // ---- Terminal success ----------------------------------------------------
  if (phase === KH_PHASES.verified || workflow?.finalState === 'confirmed') {
    const vaultState = workflow?.verifiedState;
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2 text-emerald-700">
          <CheckCircle2 size={16} />
          <h4 className="text-sm font-semibold">KeeperHub execution verified on-chain</h4>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          KeeperHub executed the approved workflow. The Sepolia transaction was confirmed and
          the contract state verified independently.
        </p>

        <div className="space-y-2 mb-4">
          {workflow?.khExecutionId && (
            <Row label="KeeperHub execution ID" mono>{workflow.khExecutionId}</Row>
          )}
          {txHash && (
            <Row label="Transaction hash" mono>
              {shortAddress(txHash, 10, 8)}
              {khExplorerTxUrl(workflow?.chainId, txHash) && (
                <a
                  href={khExplorerTxUrl(workflow?.chainId, txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink size={13} className="inline" />
                </a>
              )}
            </Row>
          )}
          {workflow?.blockNumber && <Row label="Block number" mono>{workflow.blockNumber}</Row>}
          {workflow?.gasUsed && <Row label="Gas used" mono>{workflow.gasUsed}</Row>}
          {verification?.verified && <Row label="State verification">Passed independently</Row>}
        </div>

        {vaultState && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Vault total assets</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRaw(vaultState.totalAssets, workflow?.token?.decimals, 2)} gTEST
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Your shares</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRaw(vaultState.sharesOf, workflow?.token?.decimals)}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">1 share ≈</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRaw(vaultState.exchangeRateRaw, workflow?.token?.decimals, 6)} gTEST
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ---- KeeperHub executing / pending --------------------------------------
  if ([KH_PHASES.submitting, KH_PHASES.keeperhubExecuting, KH_PHASES.txPending, KH_PHASES.verifying].includes(phase)) {
    return (
      <div className="space-y-4">
        <KeeperHubTransactionStatus
          phase={phase}
          workflow={workflow}
          khStatus={workflow?.khStatus}
          onPoll={poll}
        />
        {isBusy && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-2">
            <Loader2 size={13} className="animate-spin" />
            {phase === KH_PHASES.verifying ? 'Verifying blockchain state…' : 'Polling KeeperHub…'}
          </div>
        )}
      </div>
    );
  }

  // ---- Preparing ----------------------------------------------------------
  if (phase === KH_PHASES.preparing) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 size={16} className="animate-spin text-brand-600" />
          <h4 className="text-sm font-semibold text-slate-900">Preparing deterministic workflow…</h4>
        </div>
        <p className="text-xs text-slate-500">
          Guardian is validating the opportunity, applying the risk gate, and resolving the exact
          contract targets from its registry.
        </p>
      </div>
    );
  }

  // ---- Idle (needs wallet) ------------------------------------------------
  if (!address) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={16} className="text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-900">Connect a wallet to begin</h4>
        </div>
        <p className="text-sm text-slate-600 mb-1">
          AI Guardian will prepare a deterministic workflow. KeeperHub executes it on Sepolia
          with its own Turnkey-secured wallet. You only review and approve — no signing.
        </p>
      </div>
    );
  }

  // ---- Workflow review (step 1) ---------------------------------------------
  if (phase === KH_PHASES.reviewing && workflow) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-900">Review the exact workflow</h4>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          <Row label="Opportunity">{workflow.opportunityName || workflow.opportunityId}</Row>
          <Row label="Protocol">{workflow.metadata?.protocol || '—'}</Row>
          <Row label="Operation">{workflow.operation}</Row>
          <Row label="Amount">
            {workflow.amount?.human} {workflow.token?.symbol}
          </Row>
          <Row label="Network">Sepolia (chainId {workflow.chainId})</Row>
          <Row label="Vault contract" mono>{shortAddress(workflow.vault?.address)}</Row>
          <Row label="Strategy contract" mono>
            {workflow.strategy ? shortAddress(workflow.strategy.address) : '—'}
          </Row>
          <Row label="Token contract" mono>{shortAddress(workflow.token?.address)}</Row>
          <Row label="Risk score" mono>{workflow.riskScore}/100</Row>
          <Row label="Risk class" mono className="capitalize">{workflow.riskClassification}</Row>
          <Row label="Workflow hash" mono>{shortAddress(workflow.workflowHash, 10, 8)}</Row>
          <Row label="Executes via">
            {workflow.executionMode === 'keeperhub' ? 'KeeperHub (Turnkey wallet)' : 'Direct wallet'}
          </Row>
          <Row label="Expires">
            {new Date(workflow.expiresAt).toLocaleTimeString()}
          </Row>
        </div>

        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {w.message ?? w}
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={approve}
            disabled={isBusy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            <Check size={16} />
            Approve This Workflow
          </button>
          <button
            onClick={reset}
            className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-slate-400 text-center">
          Approving authorizes the EXACT workflow above. Nothing is sent to KeeperHub until you
          choose the next step.
        </p>
      </div>
    );
  }

  // ---- Approved (step 2): ready to send to KeeperHub ------------------------
  if (phase === KH_PHASES.approved && workflow) {
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 size={16} />
          <h4 className="text-sm font-semibold">Workflow approved</h4>
        </div>
        <p className="text-sm text-slate-600">
          Your approval is recorded. The workflow hash is
          <span className="font-mono text-xs text-slate-800"> {shortAddress(workflow.workflowHash, 10, 8)}</span>.
          KeeperHub will execute exactly this workflow — the AI will not reinterpret it.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between text-sm">
          <span className="text-slate-500">Approval ID</span>
          <span className="font-mono text-xs text-slate-700">{shortAddress(approvalId, 12, 8)}</span>
        </div>

        <button
          onClick={sendToKeeperHub}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
        >
          <Send size={16} />
          Send Approved Workflow to KeeperHub
        </button>
        <p className="text-xs text-slate-400 text-center">
          This submits the approved workflow for execution by KeeperHub on Sepolia.
        </p>
      </div>
    );
  }

  // ---- Initial state ------------------------------------------------------
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={16} className="text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-900">KeeperHub Controlled Execution</h4>
      </div>
      <p className="text-sm text-slate-600 mb-1">
        You selected <strong className="text-slate-900">{formatCurrency(amount)}</strong> with a{" "}
        <strong className="text-slate-900 capitalize">{riskPreference}</strong> risk preference.
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Guardian builds a deterministic workflow: exact token, amount, vault, and operation —
        resolved from server configuration, never from raw input. KeeperHub executes it on Sepolia
        after your explicit approval. No private keys involved.
      </p>
      <button
        onClick={() => prepare({ amount: String(amount), type: 'deposit', wallet: address })}
        disabled={!amount || Number(amount) <= 0 || isBusy}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Prepare Executable Workflow
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function Row({ label, children, mono, className = '' }) {
  return (
    <div className="flex justify-between gap-4 items-baseline">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`font-medium text-slate-900 text-right ${mono ? 'font-mono text-xs' : ''} ${className}`}>
        {children}
      </span>
    </div>
  );
}

function formatRaw(raw, decimals = 6, digits = 2) {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}