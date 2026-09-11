// Pure helpers for the transaction UI: phase progression, step lists,
// explorer links and wallet/API error decoding. Kept free of React and
// wagmi so they are trivially unit testable.

import { ApiRequestError } from './api';

const VERIFIED_PHASE = 'verified';

/** Map a phase to an index used for ordering (used for step state math). */
const PHASE_ORDER = [
  'idle',
  'preparing',
  'prepared',
  'approving',
  'awaitingApproval',
  'signing',
  'signed',
  'awaitingConfirmation',
  'verifying',
  'verified',
];

export function phaseOrder(phase) {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Steps shown in the status panel. `approve` only participates for deposits.
 * Each step carries its own `threshold` phase: the step is "current" while
 * on that threshold, "done" once the phase has passed it.
 */
export function computeSteps({ type, needsApproval }) {
  const showApprove = type === 'deposit' && needsApproval;
  return [
    { key: 'prepared', label: 'Transaction prepared', threshold: 'preparing' },
    { key: 'approve', label: 'Token approved', threshold: 'approving', hidden: !showApprove },
    { key: 'signed', label: 'Signed with your wallet', threshold: 'signing' },
    { key: 'confirmed', label: 'Confirmed on-chain', threshold: 'awaitingConfirmation' },
    { key: 'verified', label: 'Vault state verified', threshold: 'verifying' },
  ].filter((step) => !step.hidden);
}

/**
 * Assign each step a visual state: done / active / pending.
 * `edge` enables early completion (hash already recorded).
 */
export function stepStates({ phase, steps, edge }) {
  const phaseIndex = phaseOrder(phase);
  const doneEarly = {
    approve: Boolean(edge?.approvalHash),
    signed: Boolean(edge?.hasTxHash),
    confirmed: Boolean(edge?.hasReceipt),
  };

  if (phase === VERIFIED_PHASE) {
    return steps.map((step) => ({ ...step, state: 'done' }));
  }

  return steps.map((step) => {
    if (doneEarly[step.key]) {
      return { ...step, state: 'done' };
    }
    return {
      ...step,
      state: phaseIndex >= phaseOrder(step.threshold) ? 'active' : 'pending',
    };
  });
}

export function explorerTxUrl(chainId, hash) {
  const id = Number(chainId);
  if (id === 11155111) return `https://sepolia.etherscan.io/tx/${hash}`;
  if (id === 1) return `https://etherscan.io/tx/${hash}`;
  return null;
}

export function explorerAddressUrl(chainId, address) {
  const id = Number(chainId);
  if (id === 11155111) return `https://sepolia.etherscan.io/address/${address}`;
  if (id === 1) return `https://etherscan.io/address/${address}`;
  return null;
}

export function shortAddress(address, lead = 6, trail = 4) {
  if (!address) return '';
  return `${address.slice(0, lead)}…${address.slice(-trail)}`;
}

/**
 * Normalize any thrown value into { code, message } for the UI.
 * Recognizes our own API errors, wallet rejections and network failures.
 */
export function decodeError(e) {
  if (e instanceof ApiRequestError) {
    return { code: e.code, message: e.message };
  }
  const code = e?.code ?? e?.cause?.code;
  if (code === 4001 || code === 'USER_REJECTED' || e?.name === 'UserRejectedRequestError') {
    return {
      code: 'USER_REJECTED',
      message: 'The signature was cancelled in your wallet.',
    };
  }
  if (code === 4901 || code === 4902 || code === 'CHAIN_DISCONNECTED') {
    return {
      code: 'CHAIN_DISCONNECTED',
      message: 'Your wallet is not on the Sepolia network.',
    };
  }
  if (code) {
    return { code, message: e?.message || 'The transaction could not be completed.' };
  }
  return {
    code: 'EXECUTION_ERROR',
    message: e?.message || 'The transaction could not be completed.',
  };
}