import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileWorkflow, reconcileStuck } from '../backend/reconcileService.js';

const W = {
  workflowId: 'wf-1',
  finalState: 'submitted',
  khExecutionId: 'kh-1',
  khStatus: 'unconfirmed',
  txHash: null,
  chain: 'sepolia',
  chainId: 11155111,
  vaultAddress: '0x1111111111111111111111111111111111111111',
  tokenAddress: '0x9999999999999999999999999999999999999999',
  walletAddress: '0x2222222222222222222222222222222222222222',
  operation: 'deposit',
  amountRaw: '1000000',
};

function fakeRepo(seed = W) {
  let store = { ...seed };
  return {
    async findByWorkflowId() {
      return store;
    },
    async updateByWorkflowId(id, patch) {
      store = { ...store, ...patch };
      return store;
    },
    async findStuck() {
      return [store];
    },
    get: () => store,
  };
}

const TX = '0x' + 'ab'.repeat(32);
const OK_RECEIPT = { status: 'success', blockNumber: 12, to: W.vaultAddress, from: '0x9'.repeat(40), gasUsed: '100000' };

function deps(overrides = {}) {
  return {
    repository: fakeRepo(),
    getExecutionStatus: async () => ({ found: true, status: 'completed', transactionHash: TX }),
    probeReceipt: async () => OK_RECEIPT,
    verifyExecution: async () => ({
      verified: true,
      receipt: { hash: TX, status: 'success', blockNumber: 12, gasUsed: '100000', from: '0x9'.repeat(40), to: W.vaultAddress },
      events: [{ address: W.vaultAddress }],
      vaultState: { totalAssets: '2000000' },
      reason: null,
    }),
    getVaultStateFn: async () => ({ totalAssets: '2000000', sharesOf: '1000000' }),
    ...overrides,
  };
}

test('nothing submitted anywhere → db_only, never success', async () => {
  const repo = fakeRepo({ ...W, khExecutionId: null, txHash: null, finalState: 'created' });
  const r = await reconcileWorkflow(W.workflowId, { repository: repo, getExecutionStatus: deps().getExecutionStatus });
  assert.equal(r.verdict, 'db_only');
});

test('kh says completed but no tx hash → missing_tx (no silent success)', async () => {
  const repo = fakeRepo({ ...W, txHash: null });
  const r = await reconcileWorkflow(W.workflowId, {
    repository: repo,
    getExecutionStatus: async () => ({ found: true, status: 'completed', transactionHash: null }),
    probeReceipt: async () => null,
  });
  assert.equal(r.verdict, 'missing_tx');
});

test('receipt reverted → tx_reverted even if keeperhub is happy', async () => {
  const repo = fakeRepo();
  const r = await reconcileWorkflow(W.workflowId, {
    repository: repo,
    probeReceipt: async () => ({ status: 'failed', blockNumber: 12, to: W.vaultAddress, from: '0x9'.repeat(40) }),
    getExecutionStatus: async () => ({ found: true, status: 'completed', transactionHash: TX }),
    verifyExecution: async () => ({ verified: false, reason: 'n/a' }),
  });
  assert.equal(r.verdict, 'tx_reverted');
  assert.equal(repo.get().receiptStatus, undefined);
});

test('kh failed + no successful receipt → kh_failed', async () => {
  const r = await reconcileWorkflow(W.workflowId, {
    repository: fakeRepo({ ...W, txHash: TX }),
    getExecutionStatus: async () => ({ found: true, status: 'failed', transactionHash: TX }),
    probeReceipt: async () => ({ status: 'failed', blockNumber: 1, to: W.vaultAddress, from: '0x9'.repeat(40) }),
  });
  assert.equal(r.verdict, 'kh_failed');
});

test('all three agree + verified → verified', async () => {
  const repo = fakeRepo();
  const r = await reconcileWorkflow(W.workflowId, deps({ repository: repo }));
  assert.equal(r.verdict, 'verified');
  assert.equal(repo.get().finalState, 'confirmed');
  assert.ok(repo.get().reconciledAt);
  assert.ok(repo.get().reconciliation.verdict === 'verified');
});

test('receipt ok but verification of event/state fails → verification_failed', async () => {
  const r = await reconcileWorkflow(W.workflowId, deps({
    verifyExecution: async () => ({ verified: false, receipt: OK_RECEIPT, events: [], vaultState: null, reason: 'Destination mismatch' }),
  }));
  assert.equal(r.verdict, 'verification_failed');
});

test('still pending receipt → in_flight', async () => {
  const r = await reconcileWorkflow(W.workflowId, deps({ probeReceipt: async () => null }));
  assert.equal(r.verdict, 'in_flight');
});

test('reconcileStuck bats through real repo seam with bounded limit', async () => {
  const outcomes = await reconcileStuck(deps({ limit: 1 }));
  assert.ok(Array.isArray(outcomes));
  assert.equal(outcomes.length, 1);
  assert.ok(['verified', 'error'].includes(outcomes[0].verdict));
});