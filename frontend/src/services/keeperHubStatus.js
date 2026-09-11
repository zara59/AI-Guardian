// Phase 5: KeeperHub execution status helpers.
//
// Pure helpers for the Phase 5 execution UI: phase progression, explorer
// links, KeeperHub state mapping. Kept free of React so they are unit
// testable.

import { ApiRequestError } from './api';

export const KH_FINAL_STATES = new Set(['confirmed', 'failed', 'expired', 'cancelled']);

export const KH_TERMINAL_STATES = new Set(['completed', 'failed']);

/**
 * Map KeeperHub execution status to a human label.
 */
export function khStatusLabel(status) {
  const labels = {
    pending: 'Queued',
    running: 'Executing',
    unconfirmed: 'Broadcast — awaiting confirmation',
    completed: 'Completed',
    failed: 'Failed',
    simulated: 'Simulated',
    submitting: 'Submitting',
    simulation_failed: 'Simulation failed',
    idempotency_conflict: 'Already in progress',
  };
  return labels[status] || status || 'Unknown';
}

/**
 * Build the stepper steps for the KeeperHub execution UI.
 */
export function computeKhSteps({ approved, submitted, hasExecutionId, hasTxHash, verified }) {
  return [
    { key: 'workflow', label: 'Workflow prepared & reviewed', done: Boolean(approved) || submitted, active: false },
    { key: 'approval', label: 'Workflow approved by you', done: Boolean(approved), active: !approved && !submitted },
    { key: 'keeperhub', label: 'Submitted to KeeperHub', done: Boolean(hasExecutionId), active: submitted && !hasExecutionId },
    { key: 'executing', label: 'KeeperHub executing', done: Boolean(hasTxHash), active: Boolean(hasExecutionId && !hasTxHash) },
    { key: 'confirmed', label: 'Transaction confirmed', done: Boolean(verified), active: Boolean(hasTxHash && !verified) },
    { key: 'state', label: 'State verified on-chain', done: Boolean(verified), active: false },
  ];
}

export function khExplorerTxUrl(chainId, hash) {
  const id = Number(chainId);
  if (id === 11155111) return `https://sepolia.etherscan.io/tx/${hash}`;
  if (id === 1) return `https://etherscan.io/tx/${hash}`;
  return null;
}

export function khExplorerAddressUrl(chainId, address) {
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
 * Normalize errors for the KeeperHub flow.
 */
export function decodeError(e) {
  if (e instanceof ApiRequestError) {
    return { code: e.code, message: e.message, detail: e.detail };
  }
  return {
    code: e?.code || 'EXECUTION_ERROR',
    message: e?.message || 'The workflow could not be completed.',
  };
}

/**
 * Human label for the final workflow state.
 */
export function finalStateLabel(state) {
  const labels = {
    created: 'Created — awaiting approval',
    approved: 'Approved by user',
    submitted: 'Submitted to KeeperHub',
    accepted: 'Accepted by KeeperHub',
    executing: 'Executing',
    confirmed: 'Confirmed on-chain',
    failed: 'Failed',
    expired: 'Expired',
    cancelled: 'Cancelled',
  };
  return labels[state] || state || 'Unknown';
}