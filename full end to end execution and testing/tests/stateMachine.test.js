import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePhase6State,
  assertTransition,
  isSuccessState,
  isFailureState,
  ALLOWED_TRANSITIONS,
  STATE,
  pipelineTrace,
} from '../backend/stateMachine.js';

function record(overrides = {}) {
  return {
    finalState: 'created',
    approved: false,
    approvedAt: null,
    expiresAt: null,
    khExecutionId: null,
    khStatus: null,
    txHash: null,
    receiptStatus: null,
    verifiedAt: null,
    fundingState: null,
    failureReason: null,
    ...overrides,
  };
}

test('created workflow derives to awaiting_approval', () => {
  const s = derivePhase6State(record());
  assert.equal(s.state, STATE.AWAITING_APPROVAL);
  assert.equal(s.label, 'Awaiting approval');
});

test('approved workflow derives to approved', () => {
  const s = derivePhase6State(record({ finalState: 'approved', approved: true }));
  assert.equal(s.state, STATE.APPROVED);
});

test('submitted with kh id (no tx) derives to submitted_to_keeperhub', () => {
  const s = derivePhase6State(record({
    finalState: 'submitted',
    khExecutionId: 'kh-1',
    khStatus: 'pending',
  }));
  assert.equal(s.state, STATE.SUBMITTED_TO_KEEPERHUB);
});

test('running kh execution derives to keeperhub_executing', () => {
  const s = derivePhase6State(record({
    finalState: 'executing',
    khExecutionId: 'kh-1',
    khStatus: 'running',
  }));
  assert.equal(s.state, STATE.KEEPERHUB_EXECUTING);
});

test('tx hash present without verification derives to transaction_submitted', () => {
  const s = derivePhase6State(record({
    finalState: 'submitted',
    khExecutionId: 'kh-1',
    khStatus: 'unconfirmed',
    txHash: '0x' + 'ab'.repeat(32),
  }));
  assert.equal(s.state, STATE.TRANSACTION_SUBMITTED);
});

test('confirmed without verifiedAt stays confirmed (never success-derived)', () => {
  const s = derivePhase6State(record({
    finalState: 'confirmed',
    khStatus: 'completed',
    txHash: '0x' + 'ab'.repeat(32),
    receiptStatus: 'success',
  }));
  assert.equal(s.state, STATE.CONFIRMED);
  assert.equal(isSuccessState(s.state), true, 'confirmed is an on-chain-success state');
});

test('verified requires verifiedAt + confirmed', () => {
  const s = derivePhase6State(record({
    finalState: 'confirmed',
    verifiedAt: new Date().toISOString(),
    receiptStatus: 'success',
  }));
  assert.equal(s.state, STATE.VERIFIED);
});

test('receipt failed derives transaction_failed, not success', () => {
  const s = derivePhase6State(record({
    finalState: 'failed',
    receiptStatus: 'failed',
    failureReason: 'Transaction reverted on-chain',
    khStatus: 'completed',
  }));
  assert.equal(s.state, STATE.TRANSACTION_FAILED);
  assert.equal(isFailureState(s.state), true);
});

test('kh failure derives keeperhub_failed', () => {
  const s = derivePhase6State(record({
    finalState: 'failed',
    khStatus: 'failed',
    failureReason: 'KeeperHub reported execution failure',
  }));
  assert.equal(s.state, STATE.KEEPERHUB_FAILED);
});

test('verification failure derives verification_failed', () => {
  const s = derivePhase6State(record({
    finalState: 'failed',
    receiptStatus: 'success',
    failureReason: 'Independent on-chain verification failed',
  }));
  assert.equal(s.state, STATE.VERIFICATION_FAILED);
});

test('insufficient funding derives insufficient_funds', () => {
  const s = derivePhase6State(record({
    finalState: 'approved',
    fundingState: 'insufficient_gas',
  }));
  assert.equal(s.state, STATE.INSUFFICIENT_FUNDS);
});

test('expired approval derives expired', () => {
  const past = new Date(Date.now() - 1000);
  const s = derivePhase6State(record({ finalState: 'approved', approved: true, expiresAt: past }));
  assert.equal(s.state, STATE.EXPIRED);
});

test('invalidated derives invalidated', () => {
  const s = derivePhase6State(record({ finalState: 'invalidated' }));
  assert.equal(s.state, STATE.INVALIDATED);
});

test('rejected derives rejected', () => {
  const s = derivePhase6State(record({ finalState: 'cancelled' }));
  assert.equal(s.state, STATE.REJECTED);
});

test('transition table states all forward edges and rejects near-all reverses', () => {
  // Intentional recovery edge (retry a funding-blocked workflow after the
  // wallet is funded — execution never happened) is the one allowed reverse.
  const RECOVERY = new Set(['approved->insufficient_funds', 'insufficient_funds->approved']);
  for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
    for (const to of tos) {
      assert.doesNotThrow(() => assertTransition(from, to), `${from}->${to}`);
      if (!RECOVERY.has(`${from}->${to}`)) {
        assert.throws(() => assertTransition(to, from), `reverse ${to}->${from} must be illegal`);
      }
    }
  }
});

test('pipeline trace correlates opportunity → ranking → workflow', () => {
  const trace = pipelineTrace({
    opportunity: { name: 'Sepolia Staking', score: 87 },
    workflow: record({ finalState: 'confirmed', approved: true, verifiedAt: new Date().toISOString(), receiptStatus: 'success' }),
  });
  assert.ok(trace.length >= 4, 'has opportunity/ranking/workflow/execution stages');
  assert.equal(trace[1].state, STATE.RANKED);
});