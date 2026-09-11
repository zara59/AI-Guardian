// Phase 6: execution state machine.
//
// The full, explicit state vocabulary the Phase 6 spec requires:
//
//   DRAFT → RANKED → AWAITING_APPROVAL → APPROVED
//     → SUBMITTED_TO_KEEPERHUB → KEEPERHUB_EXECUTING
//     → TRANSACTION_SUBMITTED → CONFIRMED → VERIFIED
//
//   plus the real failure states:
//     REJECTED, EXPIRED, INVALIDATED, KEEPERHUB_FAILED,
//     TRANSACTION_FAILED, VERIFICATION_FAILED, INSUFFICIENT_FUNDS
//
// The durable record lives in `workflow_executions.final_state` (Phase 5) —
// this module DERIVES the Phase 6 state from that record plus the real
// KeeperHub status, receipt status, and independent-verification fields.
// Deriving (rather than duplicating a parallel status column) keeps one
// source of truth and makes it impossible to claim SUCCESS without the
// underlying record proving it.

export const STATE = Object.freeze({
  DRAFT: 'draft',
  RANKED: 'ranked',
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  SUBMITTED_TO_KEEPERHUB: 'submitted_to_keeperhub',
  KEEPERHUB_EXECUTING: 'keeperhub_executing',
  TRANSACTION_SUBMITTED: 'transaction_submitted',
  CONFIRMED: 'confirmed',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  INVALIDATED: 'invalidated',
  KEEPERHUB_FAILED: 'keeperhub_failed',
  TRANSACTION_FAILED: 'transaction_failed',
  VERIFICATION_FAILED: 'verification_failed',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
});

export const STATE_LABELS = Object.freeze({
  [STATE.DRAFT]: 'Draft',
  [STATE.RANKED]: 'Ranked',
  [STATE.AWAITING_APPROVAL]: 'Awaiting approval',
  [STATE.APPROVED]: 'Approved',
  [STATE.SUBMITTED_TO_KEEPERHUB]: 'Submitted to KeeperHub',
  [STATE.KEEPERHUB_EXECUTING]: 'KeeperHub executing',
  [STATE.TRANSACTION_SUBMITTED]: 'Transaction submitted',
  [STATE.CONFIRMED]: 'Confirmed',
  [STATE.VERIFIED]: 'Verified',
  [STATE.REJECTED]: 'Rejected',
  [STATE.EXPIRED]: 'Expired',
  [STATE.INVALIDATED]: 'Invalidated',
  [STATE.KEEPERHUB_FAILED]: 'KeeperHub failed',
  [STATE.TRANSACTION_FAILED]: 'Transaction failed',
  [STATE.VERIFICATION_FAILED]: 'Verification failed',
  [STATE.INSUFFICIENT_FUNDS]: 'Insufficient funds',
});

// Terminal (final, settled) states.
export const TERMINAL_STATES = Object.freeze([
  STATE.REJECTED,
  STATE.EXPIRED,
  STATE.INVALIDATED,
  STATE.KEEPERHUB_FAILED,
  STATE.TRANSACTION_FAILED,
  STATE.VERIFICATION_FAILED,
  STATE.INSUFFICIENT_FUNDS,
]);

const SUCCESS_STATES = new Set([STATE.CONFIRMED, STATE.VERIFIED]);
const FAILED_STATES = new Set([
  STATE.REJECTED,
  STATE.INVALIDATED,
  STATE.KEEPERHUB_FAILED,
  STATE.TRANSACTION_FAILED,
  STATE.VERIFICATION_FAILED,
  STATE.INSUFFICIENT_FUNDS,
]);

/**
 * True only for states that represent a real, independently verifiable
 * on-chain success. Anything weaker must never be rendered as "success".
 */
export function isSuccessState(state) {
  return SUCCESS_STATES.has(state);
}

export function isFailureState(state) {
  return FAILED_STATES.has(state) || state === STATE.EXPIRED;
}

/**
 * Allowed forward transitions. Used by tests and tooling to prove the
 * pipeline cannot jump straight to VERIFIED (or skip KeeperHub).
 * DRAFT → RANKED are pre-workflow states recorded on the opportunity side.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  [STATE.DRAFT]: [STATE.RANKED],
  [STATE.RANKED]: [STATE.AWAITING_APPROVAL, STATE.REJECTED],
  [STATE.AWAITING_APPROVAL]: [STATE.APPROVED, STATE.REJECTED, STATE.EXPIRED, STATE.INVALIDATED],
  [STATE.APPROVED]: [STATE.SUBMITTED_TO_KEEPERHUB, STATE.REJECTED, STATE.EXPIRED, STATE.INVALIDATED, STATE.INSUFFICIENT_FUNDS],
  [STATE.SUBMITTED_TO_KEEPERHUB]: [STATE.KEEPERHUB_EXECUTING, STATE.KEEPERHUB_FAILED, STATE.TRANSACTION_SUBMITTED],
  [STATE.KEEPERHUB_EXECUTING]: [STATE.TRANSACTION_SUBMITTED, STATE.KEEPERHUB_FAILED],
  [STATE.TRANSACTION_SUBMITTED]: [STATE.CONFIRMED, STATE.TRANSACTION_FAILED, STATE.VERIFICATION_FAILED],
  [STATE.CONFIRMED]: [STATE.VERIFIED, STATE.VERIFICATION_FAILED],
  [STATE.VERIFIED]: [],
  [STATE.REJECTED]: [],
  [STATE.EXPIRED]: [],
  [STATE.INVALIDATED]: [],
  [STATE.KEEPERHUB_FAILED]: [],
  [STATE.TRANSACTION_FAILED]: [],
  [STATE.VERIFICATION_FAILED]: [],
  [STATE.INSUFFICIENT_FUNDS]: [STATE.AWAITING_APPROVAL, STATE.APPROVED],
});

export function assertTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) throw new Error(`unknown state "${from}"`);
  if (!allowed.includes(to)) {
    throw new Error(`illegal transition ${from} → ${to}`);
  }
  return true;
}

/**
 * Derive the Phase 6 execution state from a workflow record.
 *
 * Order of checks matters — verification evidence beats a bare 'confirmed',
 * and blockchain evidence beats a bare KeeperHub status. Nothing ever
 * reports success from the accepted-request path alone.
 *
 * @param {object} record — row from workflow_executions (camelCase keys)
 * @param {object} [opts] — `{ now }` for deterministic expiry tests
 * @returns {{ state: string, label: string, hint: string|null }}
 */
export function derivePhase6State(record = {}, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();

  // Precedence: proven success → explicit failures → life-cycle states.
  if (record.verifiedAt && record.finalState === 'confirmed') {
    return make(STATE.VERIFIED, 'Receipt + independent on-chain state verification passed.');
  }

  if (record.finalState === 'confirmed') {
    // 'confirmed' in Phase 5 is set only after a positive verification attempt
    // or an un-verified KeeperHub completion — be precise about which.
    if (record.khStatus === 'completed' && !record.verifiedAt) {
      return make(
        STATE.CONFIRMED,
        'Receipt confirmed on-chain; independent state verification not yet persisted.',
      );
    }
    return make(STATE.CONFIRMED, 'Receipt status success on-chain.');
  }

  if (record.finalState === 'failed') {
    if (record.receiptStatus === 'failed') {
      return make(STATE.TRANSACTION_FAILED, 'Transaction reverted on-chain.');
    }
    if (record.khStatus === 'simulation_failed') {
      return make(STATE.KEEPERHUB_FAILED, 'KeeperHub pre-flight simulation failed.');
    }
    if (/verification/i.test(record.failureReason || '')) {
      return make(STATE.VERIFICATION_FAILED, 'Independent on-chain verification failed.');
    }
    if (record.khStatus === 'failed' || /keeperhub/i.test(record.failureReason || '')) {
      return make(STATE.KEEPERHUB_FAILED, 'KeeperHub reported execution failure.');
    }
    return make(STATE.KEEPERHUB_FAILED, record.failureReason || 'Execution failed.');
  }

  if (record.fundingState === 'insufficient_gas' || record.fundingState === 'insufficient_balance' || record.fundingState === 'insufficient_allowance') {
    return make(STATE.INSUFFICIENT_FUNDS, 'Execution wallet failed the on-chain funding/allocation gate.');
  }

  if (record.finalState === 'invalidated') {
    return make(STATE.INVALIDATED, 'Workflow parameters changed after approval; integrity check failed.');
  }

  // Expiry is evaluated lazily so an unnoticed expired approval is surfaced.
  if (record.finalState === 'created' || record.finalState === 'approved') {
    if (record.expiresAt && now > new Date(record.expiresAt)) {
      return make(STATE.EXPIRED, 'Approval window has passed.');
    }
  }

  if (record.finalState === 'expired') {
    return make(STATE.EXPIRED, 'Approval window has passed.');
  }
  if (record.finalState === 'cancelled' || record.finalState === 'rejected') {
    return make(STATE.REJECTED, 'User rejected the workflow.');
  }

  if (record.approved || record.finalState === 'approved') {
    return make(STATE.APPROVED, 'User approval recorded; ready to submit.');
  }

  // In-flight states now resolve against the real evidence we hold.
  if (record.khExecutionId) {
    if (record.txHash && /^0x[0-9a-fA-F]{64}$/.test(record.txHash || '')) {
      return make(STATE.TRANSACTION_SUBMITTED, 'Transaction broadcast; awaiting confirmation.');
    }
    if (record.khStatus === 'running' || record.finalState === 'executing') {
      return make(STATE.KEEPERHUB_EXECUTING, 'KeeperHub is executing the workflow.');
    }
    if (record.finalState === 'submitted' || record.finalState === 'accepted') {
      return make(STATE.SUBMITTED_TO_KEEPERHUB, 'Workflow accepted by KeeperHub; awaiting execution.');
    }
  }

  if (record.finalState === 'created' || record.finalState === 'draft') {
    return make(STATE.AWAITING_APPROVAL, 'Workflow prepared for review by the user.');
  }

  return make(record.finalState || STATE.AWAITING_APPROVAL, null);
}

function make(state, hint) {
  return { state, label: STATE_LABELS[state] || state, hint };
}

/**
 * Trace the whole pipeline for one opportunity-driven decision:
 * opportunity → ranked → workflow → ... → verified. This is the shape the
 * Activity page uses to correlate the audit trail (Phase 6 §13).
 *
 * @param {{opportunity: object|null, workflow: object|null}} parts
 * @returns {Array<{stage, state, label, detail}>}
 */
export function pipelineTrace({ opportunity, workflow } = {}) {
  const trace = [];
  trace.push({
    stage: 'opportunity',
    state: opportunity ? STATE.DRAFT : 'missing',
    label: opportunity ? 'Opportunity collected' : 'Opportunity missing',
    detail: opportunity?.name || opportunity?.slug || null,
  });
  trace.push({
    stage: 'ranking',
    state: opportunity?.score ? STATE.RANKED : 'missing',
    label: opportunity?.score ? 'Ranked by Guardian' : 'Not ranked',
    detail: opportunity?.score != null ? String(opportunity.score) : null,
  });
  if (workflow) {
    const derived = derivePhase6State(workflow);
    trace.push({ stage: 'workflow', state: derived.state, label: derived.label, detail: workflow.workflowId || null });
    trace.push({ stage: 'execution', state: derived.state, label: derived.label, detail: null });
  }
  return trace;
}