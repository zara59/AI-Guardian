import { useEffect, useRef, useState } from 'react';
import {
  Lock,
  ArrowRight,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  RefreshCcw,
  AlertTriangle,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet.js';
import { useWalletActions } from '../hooks/useWalletActions.js';
import { useTransaction, PHASES } from '../hooks/useTransaction.js';
import TransactionStatus from './TransactionStatus.jsx';
import WalletConnect from './WalletConnect.jsx';
import { formatCurrency } from '../utils/formatting';
import { guardianChain } from '../config/wagmi.js';
import { explorerTxUrl, shortAddress } from '../services/transactionStatus.js';

const BUSY = [
  PHASES.approving,
  PHASES.awaitingApproval,
  PHASES.signing,
  PHASES.signed,
  PHASES.awaitingConfirmation,
  PHASES.verifying,
];

export default function ApprovalPreview({ opportunity, amount, riskPreference }) {
  const wallet = useWallet();
  const actions = useWalletActions();
  const {
    transaction,
    warnings,
    approval,
    txHash,
    receipt,
    verification,
    phase,
    error,
    needsApproval,
    prepare,
    execute,
    reset,
  } = useTransaction(opportunity, actions);

  const previousAmount = useRef(amount);
  useEffect(() => {
    if (previousAmount.current !== amount) {
      previousAmount.current = amount;
      if (phase === PHASES.prepared) reset();
    }
  }, [amount, phase, reset]);

  const [mode, setMode] = useState('deposit');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const isWithdraw = mode === 'withdraw' || transaction?.type === 'withdraw';

  const wrongNetwork =
    wallet.isConnected && wallet.chainId && Number(wallet.chainId) !== guardianChain.id;

  if (!wallet.isConnected) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={16} className="text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-900">Connect a wallet to execute</h4>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Guardian will prepare a risk-gated, server-verified transaction on {guardianChain.name}.
          You review and sign every step — nothing moves without your signature.
        </p>
        <WalletConnect />
      </div>
    );
  }

  if (phase === PHASES.failed && error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2 text-red-700">
          <ShieldAlert size={16} />
          <h4 className="text-sm font-semibold">Execution stopped</h4>
        </div>
        <p className="text-sm text-slate-600 mb-1">{error.message}</p>
        <p className="text-xs text-slate-400 mb-4">
          {error.code ? `Code: ${error.code}` : 'Please review and try again.'}
          No funds were moved unless the wallet already confirmed a step.
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

  if (phase === PHASES.verified) {
    const verdict = verification?.verification;
    const vaultState = verdict?.onChain?.vaultState;
    const link = verification?.txHash ? explorerTxUrl(transaction?.chainId, verification.txHash) : null;
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2 text-emerald-700">
          <CheckCircle2 size={16} />
          <h4 className="text-sm font-semibold">
            {isWithdraw ? 'Withdrawal confirmed on-chain' : 'Deposit confirmed on-chain'}
          </h4>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          The vault state was read back and verified by Guardian.
        </p>
        {vaultState && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Vault total assets</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRaw(vaultState.totalAssets, transaction?.asset?.decimals, 2)} gTEST
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Your shares</p>
              <p className="text-sm font-medium text-slate-900">
                {formatShares(vaultState.sharesOf, transaction?.asset?.decimals)}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">1 share ≈</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRaw(vaultState.exchangeRateRaw, transaction?.asset?.decimals, 6)} gTEST
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
            >
              View transaction <ExternalLink size={13} />
            </a>
          )}
          <span className="text-xs text-slate-400">Block {verification?.verification?.receipt?.blockNumber ?? '—'}</span>
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

  if (phase === PHASES.prepared && transaction) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-900">Server-prepared execution</h4>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">{transaction.type === 'withdraw' ? 'Withdrawal' : 'Deposit'}</span>
            <span className="font-medium text-slate-900">
              {transaction.amount?.human} {transaction.asset?.symbol}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Vault</span>
            <span className="font-mono text-xs text-slate-700">{shortAddress(transaction.vault?.address)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Strategy</span>
            <span className="font-mono text-xs text-slate-700">
              {transaction.strategy ? shortAddress(transaction.strategy.address) : '—'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Signing wallet</span>
            <span className="font-mono text-xs text-slate-700">{shortAddress(transaction.tx?.from)}</span>
          </div>
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

        {wrongNetwork && (
          <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            Your wallet is on another network. Switch to {guardianChain.name} — Guardian will prompt this
            when you sign.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={execute}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            {transaction.type === 'withdraw'
              ? 'Withdraw now'
              : needsApproval
                ? 'Approve & Deposit'
                : 'Deposit now'}
            <ArrowRight size={16} />
          </button>
          <button
            onClick={reset}
            className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (BUSY.includes(phase)) {
    return (
      <TransactionStatus
        phase={phase}
        type={transaction?.type ?? mode}
        needsApproval={needsApproval}
        approvalHash={approval?.hash}
        txHash={txHash}
        hasReceipt={Boolean(receipt)}
        chainId={transaction?.chainId}
      />
    );
  }

  if (phase === PHASES.preparing) {
    return (
      <TransactionStatus
        phase={phase}
        type={mode}
        needsApproval={false}
        approvalHash={null}
        txHash={null}
        hasReceipt={false}
        chainId={guardianChain.id}
        busyLabel={
          isWithdraw
            ? 'Preparing a risk-gated withdrawal plan…'
            : 'Preparing a risk-gated execution plan…'
        }
      />
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lock size={16} className="text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-900">Ready for your approval</h4>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 mb-4">
        {['deposit', 'withdraw'].map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              reset();
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === m ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {m === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        ))}
      </div>

      {mode === 'deposit' ? (
        <>
          <p className="text-sm text-slate-600 mb-1">
            You selected <strong className="text-slate-900">{formatCurrency(amount)}</strong> with a{" "}
            <strong className="text-slate-900 capitalize">{riskPreference}</strong> risk preference
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Guardian prepares the exact deposit transaction (targets, amounts, gas) from its own
            registry — your wallet only reviews and signs. Nothing is executed without your signature.
          </p>
          {wrongNetwork && (
            <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Your wallet is on another network. Connect to {guardianChain.name} before preparing.
            </p>
          )}
          <button
            onClick={() => prepare({ amount: String(amount), type: 'deposit' })}
            disabled={!amount || Number(amount) <= 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review Execution
            <ArrowRight size={16} />
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600 mb-1">
            Withdraw from your vault position on {guardianChain.name}.
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Enter the amount in gTEST to redeem. Guardian prepares the exact vault withdrawal — your
            wallet reviews and signs it.
          </p>
          {wrongNetwork && (
            <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Your wallet is on another network. Connect to {guardianChain.name} before preparing.
            </p>
          )}
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Withdrawal amount"
            className="w-full mb-3 px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-400"
          />
          <button
            onClick={() => prepare({ amount: String(withdrawAmount || 0), type: 'withdraw' })}
            disabled={!withdrawAmount || Number(withdrawAmount) <= 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review Withdrawal
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function formatRaw(raw, decimals = 6, digits = 2) {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function formatShares(raw, decimals = 6) {
  // ERC-4626 receipt shares mirror the asset decimals (6 for gTEST), not 18.
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 6) });
}