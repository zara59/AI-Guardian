import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalWorkflowString,
  workflowHashOf,
  createWorkflow,
  approveWorkflow,
  executeWorkflow,
  reconcileWorkflow,
} from '../backend/workflowService.js';
import { mapKhStatus } from '../backend/poller.js';
import { verifyExecution } from '../backend/verifier.js';
import { resetConfig } from '../backend/config.js';

// ---------------------------------------------------------------------------
// Deterministic hashing — the immutability guarantee of the whole design
// ---------------------------------------------------------------------------

const BASE_WORKFLOW = {
  chainId: 11155111,
  tokenAddress: '0x9999999999999999999999999999999999999999',
  tokenDecimals: 6,
  vaultAddress: '0x1111111111111111111111111111111111111111',
  strategyAddress: '0x3333333333333333333333333333333333333333',
  operation: 'deposit',
  amountRaw: '1500000',
  opportunityId: 42,
  walletAddress: '0x2222222222222222222222222222222222222222',
};

test('workflow hash is deterministic', () => {
  const a = workflowHashOf(BASE_WORKFLOW);
  const b = workflowHashOf({ ...BASE_WORKFLOW });
  assert.equal(a, b);
  assert.equal(a.length, 64, 'sha-256 hex');
});

test('canonical string isolates fields with delimiters', () => {
  const one = canonicalWorkflowString({ ...BASE_WORKFLOW, amountRaw: '1500000' });
  const two = canonicalWorkflowString({ ...BASE_WORKFLOW, amountRaw: '150' });
  assert.notEqual(one, two);
});

test('changing any parameter changes the hash (tamper detection)', () => {
  const base = workflowHashOf(BASE_WORKFLOW);
  for (const key of ['chainId', 'tokenAddress', 'vaultAddress', 'strategyAddress', 'operation', 'amountRaw', 'walletAddress']) {
    const altered = { ...BASE_WORKFLOW, [key]: key === 'operation' ? 'withdraw' : `x-${BASE_WORKFLOW[key]}` };
    assert.notEqual(
      workflowHashOf(altered),
      base,
      `${key} must change the hash`,
    );
  }
});

test('addresses are normalized to lowercase in the hash', () => {
  const upper = { ...BASE_WORKFLOW, walletAddress: '0x2222222222222222222222222222222222222222'.toUpperCase() };
  assert.equal(workflowHashOf(upper), workflowHashOf(BASE_WORKFLOW));
});

// ---------------------------------------------------------------------------
// Test fixtures + injectable deps
// ---------------------------------------------------------------------------

const TOKEN = { address: '0x9999999999999999999999999999999999999999', decimals: 6 };
const STRATEGY = { address: '0x3333333333333333333333333333333333333333' };
const VAULT = { address: '0x1111111111111111111111111111111111111111' };
const WALLET = '0x2222222222222222222222222222222222222222';
const CONTRACTS = { token: TOKEN, strategy: STRATEGY, vault: VAULT };
const NETWORK = { id: 'sepolia', chainId: 11155111 };

function opportunity(overrides = {}) {
  return {
    id: 42,
    chainId: 11155111,
    chain: 'sepolia',
    slug: 'sepolia-eth-staking',
    name: 'Sepolia Staking Pool',
    protocol: 'staker',
    category: 'liquid-staking',
    eligibility: 'eligible',
    risk: 'low',
    apy: '5.4',
    tvlUsd: '1234567',
    dataConfidence: 'high',
    lastUpdated: new Date().toISOString(),
    smartContractSecurity: 8, protocolHistory: 9, liquidityStability: 8,
    contractPermissions: 8, exploitIndicators: 9, currentYield: 9,
    historicalSustainability: 8, incentives: 7, opportunitySize: 8,
    marketConditions: 8, businessModel: 9, rewardSustainability: 8,
    protocolActivity: 8, availableLiquidity: 8, withdrawalConditions: 8,
    minimumCapital: 8, riskPreferenceFit: 8, complexity: 9, timeCommitment: 8,
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    id: 1,
    workflowId: 'wf123',
    approvalId: null,
    opportunityId: 42,
    userId: 1,
    walletAddress: WALLET,
    chainId: 11155111,
    chain: 'sepolia',
    tokenAddress: TOKEN.address,
    tokenDecimals: 6,
    vaultAddress: VAULT.address,
    strategyAddress: STRATEGY.address,
    operation: 'deposit',
    amountRaw: '1500000',
    amountHuman: '1.5',
    workflowHash: workflowHashOf(BASE_WORKFLOW),
    riskScore: 111,
    riskClassification: 'low',
    riskGatePassed: true,
    approved: false,
    approvedAt: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    executionMode: 'keeperhub',
    idempotencyKey: null,
    khExecutionId: null,
    khStatus: null,
    txHash: null,
    blockNumber: null,
    gasUsed: null,
    receiptStatus: null,
    sponsored: false,
    finalState: 'created',
    failureReason: null,
    metadata: { opportunityName: 'Sepolia Staking Pool' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function repoFakes({ seed = null } = {}) {
  let store = seed;
  return {
    async insert(wf) {
      store = record({ ...wf, workflowId: wf.workflowId, workflowHash: wf.workflowHash, expiresAt: wf.expiresAt });
      return store;
    },
    async findByWorkflowId() {
      return store;
    },
    async findByApprovalId() {
      return store;
    },
    async findByKhExecutionId() {
      return store;
    },
    async findByTxHash() {
      return store;
    },
    async findRecentByUser() {
      return store ? [store] : [];
    },
    async findExpired() {
      return [];
    },
    async findStuck() {
      return [];
    },
    async updateByWorkflowId(workflowId, patch) {
      store = { ...store, ...patch };
      return store;
    },
    async tryMarkSubmitting(workflowId) {
      if (store && store.finalState === 'approved' && store.approved) {
        store = { ...store, finalState: 'submitted' };
        return store;
      }
      return null;
    },
  };
}

function baseOverrides(extra = {}) {
  return {
    getUserRepositoryContext: () => Promise.resolve({ id: 1 }),
    opportunityRepository: { findById: () => Promise.resolve(opportunity()) },
    activityRepository: { insert: () => Promise.resolve(null) },
    getGuardianContracts: () => Promise.resolve(CONTRACTS),
    getNetwork: () => Promise.resolve(NETWORK),
    repository: repoFakes({ seed: null }).repository ?? repoFakes(),
    keeperHubAdapter: {
      getName: () => 'keeperhub',
      simulate: async () => ({ success: true, wouldRevert: false, error: null }),
      execute: async () => ({ success: true, executionId: 'kh-123', status: 'submitted', transactionHash: null, sponsored: false }),
      getStatus: async () => ({ found: true, status: 'completed', transactionHash: '0x' + 'aa'.repeat(32), pollIntervalHint: 0 }),
    },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// createWorkflow — server-derived, deterministic, gated
// ---------------------------------------------------------------------------

test('createWorkflow must require a valid wallet address', async () => {
  await assert.rejects(
    () => createWorkflow({ opportunityId: 42, walletAddress: 'nope', amount: '1.5' }, baseOverrides()),
    (err) => err.code === 'INVALID_WALLET',
  );
});

test('createWorkflow rejects an unsupported operation', async () => {
  await assert.rejects(
    () => createWorkflow({ opportunityId: 42, walletAddress: WALLET, amount: '1.5', type: 'hack' }, baseOverrides()),
    (err) => err.code === 'INVALID_TYPE',
  );
});

test('createWorkflow applies the risk gate', async () => {
  await assert.rejects(
    () =>
      createWorkflow(
        { opportunityId: 42, walletAddress: WALLET, amount: '1.5' },
        baseOverrides({ opportunityRepository: { findById: () => Promise.resolve(opportunity({ risk: 'high' })) } }),
      ),
    (err) => err.code === 'RISK_GATE',
  );
});

test('createWorkflow blocks when contracts are not deployed', async () => {
  await assert.rejects(
    () =>
      createWorkflow(
        { opportunityId: 42, walletAddress: WALLET, amount: '1.5' },
        baseOverrides({ getGuardianContracts: () => Promise.resolve(null) }),
      ),
    (err) => err.code === 'NOT_DEPLOYED',
  );
});

test('createWorkflow uses real token decimals (never 18) for the raw amount', async () => {
  const wf = await createWorkflow({ opportunityId: 42, walletAddress: WALLET, amount: '1.5' }, baseOverrides());
  assert.equal(wf.amount.raw, '1500000', '6-decimal human 1.5 -> 1500000 base units');
  assert.equal(wf.amount.human, '1.5');
  assert.equal(wf.token.decimals, 6);
});

test('createWorkflow returns a hashable, immutable workflow', async () => {
  const wf = await createWorkflow({ opportunityId: 42, walletAddress: WALLET, amount: '1.5' }, baseOverrides());
  assert.equal(wf.finalState, 'created');
  assert.equal(wf.riskGatePassed, true);
  assert.equal(wf.chainId, 11155111);
  assert.ok(wf.expiresAt);
  assert.equal(wf.workflowHash.length, 64);
});

test('executionMode defaults to keeperhub when a kh_ key is configured', async () => {
  const prev = process.env.KEEPERHUB_API_KEY;
  process.env.KEEPERHUB_API_KEY = 'kh_test_secret';
  resetConfig();
  try {
    const wf = await createWorkflow({ opportunityId: 42, walletAddress: WALLET, amount: '1.5' }, baseOverrides());
    assert.equal(wf.executionMode, 'keeperhub');
  } finally {
    if (prev === undefined) delete process.env.KEEPERHUB_API_KEY;
    else process.env.KEEPERHUB_API_KEY = prev;
    resetConfig();
  }
});

test('executionMode falls back to direct when no KeeperHub key is configured', async () => {
  const prev = process.env.KEEPERHUB_API_KEY;
  if (prev !== undefined) delete process.env.KEEPERHUB_API_KEY;
  resetConfig();
  try {
    const wf = await createWorkflow({ opportunityId: 42, walletAddress: WALLET, amount: '1.5' }, baseOverrides());
    assert.equal(wf.executionMode, 'direct');
  } finally {
    if (prev !== undefined) process.env.KEEPERHUB_API_KEY = prev;
    resetConfig();
  }
});

// ---------------------------------------------------------------------------
// approveWorkflow — explicit authorization + integrity
// ---------------------------------------------------------------------------

test('approveWorkflow requires the workflow to exist and belong to the user', async () => {
  await assert.rejects(
    () => approveWorkflow('missing', baseOverrides({ repository: repoFakes({ seed: null }) })),
    (err) => err.code === 'NOT_FOUND',
  );
});

test('approveWorkflow refuses a non-owner', async () => {
  const deps = baseOverrides();
  deps.getUserRepositoryContext = () => Promise.resolve({ id: 2 });
  const seed = record();
  await assert.rejects(
    () => approveWorkflow('wf123', { ...deps, repository: repoFakes({ seed }) }),
    (err) => err.code === 'FORBIDDEN',
  );
});

test('approveWorkflow records an approval with a fresh approval id', async () => {
  const seed = record();
  const repo = repoFakes({ seed });
  const approved = await approveWorkflow('wf123', { ...baseOverrides(), repository: repo });
  assert.equal(approved.approved, true);
  assert.ok(approved.approvalId);
  assert.equal(approved.finalState, 'approved');
  assert.ok(approved.approvedAt);
});

test('approveWorkflow refuses a second approval', async () => {
  const seed = record({ approved: true, approvalId: 'approval-existing', finalState: 'approved' });
  await assert.rejects(
    () => approveWorkflow('wf123', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'ALREADY_APPROVED',
  );
});

test('approveWorkflow refuses an expired workflow', async () => {
  const seed = record({ expiresAt: new Date(Date.now() - 1000) });
  await assert.rejects(
    () => approveWorkflow('wf123', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'EXPIRED',
  );
});

test('approveWorkflow catches post-preparation tampering via the hash', async () => {
  const seed = record({ operation: 'deposit' });
  seed.amountRaw = '999999'; // changed after preparation
  await assert.rejects(
    () => approveWorkflow('wf123', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'INTEGRITY',
  );
});

// ---------------------------------------------------------------------------
// executeWorkflow — no broadcast before approval, idempotent, honest
// ---------------------------------------------------------------------------

test('executeWorkflow refuses a workflow that was never approved', async () => {
  const seed = record();
  await assert.rejects(
    () => executeWorkflow('approval-1', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'NOT_APPROVED',
  );
});

test('executeWorkflow refuses when the approval id is unknown', async () => {
  await assert.rejects(
    () => executeWorkflow('nope', baseOverrides({ repository: repoFakes({ seed: null }) })),
    (err) => err.code === 'NOT_FOUND',
  );
});

test('executeWorkflow simulates first, then submits with a deterministic key', async () => {
  let executedWith = null;
  let keyUsed = null;
  const deps = baseOverrides({
    repository: repoFakes({ seed: record({ approved: true, approvalId: 'approval-1', finalState: 'approved' }) }),
    keeperHubAdapter: {
      getName: () => 'keeperhub',
      simulate: async () => ({ success: true, wouldRevert: false }),
      execute: async (_wf, key) => {
        executedWith = _wf;
        keyUsed = key;
        return { success: true, executionId: 'kh-9', status: 'submitted', transactionHash: null, sponsored: false };
      },
    },
  });
  const result = await executeWorkflow('approval-1', deps);
  assert.equal(result.khExecutionId, 'kh-9');
  assert.equal(result.finalState, 'submitted');
  assert.ok(keyUsed, 'idempotency key derived from the workflow hash');
  assert.ok(executedWith.workflowId);
});

test('executeWorkflow does NOT broadcast when simulation fails', async () => {
  let executed = false;
  const deps = baseOverrides({
    repository: repoFakes({ seed: record({ approved: true, approvalId: 'approval-1', finalState: 'approved' }) }),
    keeperHubAdapter: {
      getName: () => 'keeperhub',
      simulate: async () => ({ success: false, wouldRevert: true, error: 'simulate says revert' }),
      execute: async () => {
        executed = true;
        return { success: true, executionId: 'kh-x' };
      },
    },
  });
  await assert.rejects(
    () => executeWorkflow('approval-1', deps),
    (err) => err.code === 'SIMULATION_FAILED',
  );
  assert.equal(executed, false, 'never broadcast when simulation failed');
});

test('executeWorkflow refuses duplicate execution of the same workflow', async () => {
  const seed = record({ approved: true, approvalId: 'approval-1', finalState: 'executing', khExecutionId: 'kh-42', khStatus: 'running' });
  await assert.rejects(
    () => executeWorkflow('approval-1', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'DUPLICATE',
  );
});

test('executeWorkflow refuses an expired approved workflow', async () => {
  const seed = record({ approved: true, approvalId: 'approval-1', finalState: 'approved', expiresAt: new Date(Date.now() - 1000) });
  await assert.rejects(
    () => executeWorkflow('approval-1', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'EXPIRED',
  );
});

test('executeWorkflow marks a KeeperHub broadcast failure failed', async () => {
  const deps = baseOverrides({
    repository: repoFakes({ seed: record({ approved: true, approvalId: 'approval-1', finalState: 'approved' }) }),
    keeperHubAdapter: {
      getName: () => 'keeperhub',
      simulate: async () => ({ success: true }),
      execute: async () => ({ success: false, error: 'boom' }),
    },
  });
  await assert.rejects(
    () => executeWorkflow('approval-1', deps),
    (err) => err.code === 'EXECUTION_FAILED',
  );
});

test('executeWorkflow recovers on an idempotency 409 conflict', async () => {
  const seed = record({ approved: true, approvalId: 'approval-1', finalState: 'approved' });
  const deps = baseOverrides({
    repository: repoFakes({ seed }),
    keeperHubAdapter: {
      getName: () => 'keeperhub',
      simulate: async () => ({ success: true }),
      execute: async () => ({ success: false, conflict: true, originalExecutionId: 'kh-original', retryable: true, error: 'dup' }),
    },
  });
  const result = await executeWorkflow('approval-1', deps);
  assert.equal(result.khExecutionId, 'kh-original');
  assert.equal(result.finalState, 'accepted');
  assert.equal(result.khStatus, 'idempotency_conflict');
});

// ---------------------------------------------------------------------------
// reconcileWorkflow — blockchain is the final source of truth
// ---------------------------------------------------------------------------

test('reconcile refuses when there is no transaction to verify', async () => {
  const seed = record({ approved: true, finalState: 'confirmed' });
  await assert.rejects(
    () => reconcileWorkflow('wf123', baseOverrides({ repository: repoFakes({ seed }) })),
    (err) => err.code === 'NO_TX',
  );
});

// ---------------------------------------------------------------------------
// mapKhStatus — KeeperHub status mapping never fabricates a state
// ---------------------------------------------------------------------------

test('mapKhStatus maps known KeeperHub statuses honestly', () => {
  assert.equal(mapKhStatus('pending'), 'submitted');
  assert.equal(mapKhStatus('running'), 'executing');
  assert.equal(mapKhStatus('unconfirmed'), 'accepted');
  assert.equal(mapKhStatus('completed'), 'confirmed');
  assert.equal(mapKhStatus('failed'), 'failed');
  assert.equal(mapKhStatus('unknown-thing'), 'unknown-thing', 'unknown statuses pass through, never faked');
});

// ---------------------------------------------------------------------------
// verifyExecution — independent on-chain verification
// ---------------------------------------------------------------------------

test('verifyExecution fails loudly without a tx hash', async () => {
  const result = await verifyExecution({ chain: 'sepolia' }, {});
  assert.equal(result.verified, false);
  assert.match(result.reason, /No transaction hash/);
});

test('verifyExecution rejects a reverting receipt', async () => {
  const result = await verifyExecution(
    { chain: 'sepolia', txHash: '0x' + 'aa'.repeat(32), vaultAddress: VAULT.address, tokenAddress: TOKEN.address, walletAddress: WALLET },
    {
      getReceipt: async () => ({ status: 'failed', blockNumber: 10, hash: '0x' + 'aa'.repeat(32), from: WALLET, to: VAULT.address, gasUsed: 100n }),
      getLogsFn: async () => [],
      getVaultStateFn: async () => ({}),
    },
  );
  assert.equal(result.verified, false);
  assert.match(result.reason, /reverted/);
});

test('verifyExecution confirms success and returns block state', async () => {
  const txHash = '0x' + 'bb'.repeat(32);
  const result = await verifyExecution(
    { chain: 'sepolia', txHash, vaultAddress: VAULT.address, tokenAddress: TOKEN.address, walletAddress: WALLET },
    {
      getReceipt: async () => ({ hash: txHash, status: 'success', blockNumber: 88, from: WALLET, to: VAULT.address, gasUsed: 120000n }),
      getLogsFn: async () => [
        { address: VAULT.address.toLowerCase(), transactionHash: txHash, data: '0x00', blockNumber: 88 },
      ],
      getVaultStateFn: async () => ({ totalAssets: '1500000', sharesOf: '1500000' }),
    },
  );
  assert.equal(result.verified, true);
  assert.equal(result.receipt.blockNumber, 88);
  assert.equal(result.events.length, 1);
  assert.equal(result.vaultState.totalAssets, '1500000');
});