import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRaw, fromRaw, formatRaw, isValidAmountString } from '../src/utils/amounts.js';
import { encodeCalldata, decodeUint, decodeAddress, decodeEventArgs } from '../src/external/abi.js';
import {
  prepareTransaction,
  recordUserTransaction,
  verifyTransactionState,
  getTransactionStatus,
} from '../src/services/transactionService.js';

// ---------------------------------------------------------------------------
// amounts — BigInt raw <-> human, no floats
// ---------------------------------------------------------------------------

test('toRaw converts human decimals to base units with token decimals', () => {
  assert.equal(toRaw('15.25', 6), 15250000n);
  assert.equal(toRaw('15', 6), 15000000n);
  assert.equal(toRaw('0.000001', 6), 1n);
  assert.equal(toRaw('0.5', 18), 500000000000000000n);
  assert.equal(toRaw('100.999999', 6), 100999999n);
});

test('toRaw rejects malformed / over-precision input', () => {
  assert.throws(() => toRaw('15.25.1', 6));
  assert.throws(() => toRaw('-5', 6));
  assert.throws(() => toRaw('abc', 6));
  assert.throws(() => toRaw('1.0000001', 6), 'too many decimals');
});

test('fromRaw reproduces human decimals and trims cruft', () => {
  assert.equal(fromRaw(15250000n, 6), '15.25');
  assert.equal(fromRaw(15000000n, 6, 0), '15');
  assert.equal(fromRaw(1n, 6), '0.000001');
  assert.equal(fromRaw(0n, 6), '0');
});

test('formatRaw groups thousands', () => {
  assert.equal(formatRaw(1234567_000000n, 6), '1,234,567');
});

test('isValidAmountString enforces positivity and precision', () => {
  assert.equal(isValidAmountString('10', 6), true);
  assert.equal(isValidAmountString('10.5', 6), true);
  assert.equal(isValidAmountString('0', 6), false);
  assert.equal(isValidAmountString('-1', 6), false);
  assert.equal(isValidAmountString('1.1234567', 6), false, 'too precise');
  assert.equal(isValidAmountString('', 6), false);
});

// ---------------------------------------------------------------------------
// abi — minimal encode/decode
// ---------------------------------------------------------------------------

test('encodeCalldata pads address + uint args', () => {
  const data = encodeCalldata('0x095ea7b3', [
    { type: 'address', value: '0x1111111111111111111111111111111111111111' },
    { type: 'uint256', value: 5000000n },
  ]);
  assert.equal(data.length, 10 + 64 + 64);
  assert.equal(data.startsWith('0x095ea7b3'), true);
  assert.ok(data.endsWith('00000000000000000000000000000000000000000000000000000000004c4b40'));
});

test('decodeUint / decodeAddress extract typed words', () => {
  assert.equal(decodeUint('0x00000000000000000000000000000000000000000000000000000000000f4240'), 1000000n);
  assert.equal(
    decodeAddress('0x0000000000000000000000001111111111111111111111111111111111111111'),
    '0x1111111111111111111111111111111111111111',
  );
});

test('decodeEventArgs decodes an ERC-20 Transfer', () => {
  const sig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const topics = [
    sig,
    '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ];
  const result = decodeEventArgs(topics, '0x000000000000000000000000000000000000000000000000000000000000000a');
  assert.equal(result.transfer.from, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.transfer.to, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(result.transfer.value, 10n);
});

// ---------------------------------------------------------------------------
// transactionService — preparation + lifecycle with injected deps
// ---------------------------------------------------------------------------

const TOKEN = { address: '0x1234567890abcdef1234567890abcdef12345678', decimals: 6 };
const STRATEGY = { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' };
const VAULT = { address: '0x1111111111111111111111111111111111111111' };
const WALLET = '0x2222222222222222222222222222222222222222';

function opportunity(overrides = {}) {
  return {
    id: 7,
    chainId: 1,
    chain: 'ethereum',
    eligibility: 'eligible',
    risk: 'low',
    name: 'Ethereum Staking Pool',
    smartContractSecurity: 8, protocolHistory: 9, liquidityStability: 8,
    contractPermissions: 8, exploitIndicators: 9, currentYield: 9,
    historicalSustainability: 8, incentives: 7, opportunitySize: 8,
    marketConditions: 8, businessModel: 9, rewardSustainability: 8,
    protocolActivity: 8, availableLiquidity: 8, withdrawalConditions: 8,
    minimumCapital: 8, riskPreferenceFit: 8, complexity: 9, timeCommitment: 8,
    ...overrides,
  };
}

function buildRecord(overrides = {}) {
  return {
    id: 1,
    prepareId: 'abc123',
    opportunityId: 7,
    type: 'deposit',
    chain: 'ethereum',
    chainId: 1,
    tokenAddress: TOKEN.address,
    tokenDecimals: 6,
    vaultAddress: VAULT.address,
    strategyAddress: STRATEGY.address,
    amountRaw: '1500000',
    amountHuman: '1.5',
    spendTo: VAULT.address,
    status: 'prepared',
    txHash: null,
    blockNumber: null,
    gasUsed: null,
    errorMessage: null,
    signedAt: null,
    confirmedAt: null,
    validUntil: new Date(Date.now() + 60 * 1000),
    createdAt: new Date(),
    userId: 1,
    metadata: {},
    ...overrides,
  };
}

function repoFakes({ recordOverrides = {}, seed = null } = {}) {
  let inserted = seed;
  const baseRecord = buildRecord(recordOverrides);
  return {
    transactionRepository: {
      async insert(tx) {
        inserted = { ...baseRecord, ...tx };
        return inserted;
      },
      async findByPrepareId() {
        return inserted;
      },
      async updateByPrepareId(prepareId, patch) {
        inserted = { ...inserted, ...patch };
        return inserted;
      },
      async findRecentByUser() {
        return inserted ? [inserted] : [];
      },
    },
    activityRepository: {
      async insert() {
        return null;
      },
    },
  };
}

function providerFakes({ balance = 5000000n, allowance = 5000000n, gas = 90000n, receipt = null, logs = [], vaultState = null } = {}) {
  return {
    async getTokenBalance() {
      return balance;
    },
    async getTokenAllowance() {
      return allowance;
    },
    async estimateContractCall() {
      return { gasLimit: gas };
    },
    async getTransactionReceipt() {
      return receipt;
    },
    async getLogs() {
      return logs;
    },
    async getVaultState() {
      return vaultState;
    },
  };
}

const baseOverrides = (extra = {}) => ({
  getUserRepositoryContext: async () => ({ id: 1 }),
  opportunityRepository: { findById: async () => opportunity() },
  getGuardianContracts: async () => ({
    deployment: {},
    token: TOKEN,
    strategy: STRATEGY,
    vault: { address: VAULT.address },
  }),
  getNetwork: async () => ({ id: 'ethereum', chainId: 1, rpcUrl: 'http://fake' }),
  ...repoFakes(),
  provider: providerFakes(),
  ...extra,
});

test('prepareTransaction returns server-derived targets and exact amounts', async () => {
  const prepared = await prepareTransaction(
    { opportunityId: 7, walletAddress: WALLET, amount: '1.5', type: 'deposit' },
    baseOverrides(),
  );

  assert.equal(prepared.chainId, 1);
  assert.equal(prepared.asset.decimals, 6, 'uses token decimals, never 18');
  assert.equal(prepared.amount.raw, '1500000', 'BigInt raw from 6-decimal human input');
  assert.equal(prepared.amount.human, '1.5');
  assert.equal(prepared.vault.address, VAULT.address);
  assert.equal(prepared.tx.to, VAULT.address, 'deposits target the vault');
  assert.equal(prepared.tx.from, WALLET.toLowerCase());
  assert.ok(prepared.tx.data.startsWith('0x6e553f65'), 'deposit selector');
  assert.equal(prepared.status, 'prepared');
  assert.ok(prepared.validUntil > new Date());
  assert.equal(prepared.opportunity.id, 7);
});

test('prepareTransaction computes the approve payload', async () => {
  const prepared = await prepareTransaction(
    { opportunityId: 7, walletAddress: WALLET, amount: '2', type: 'approve' },
    baseOverrides(),
  );
  assert.equal(prepared.tx.to, TOKEN.address, 'approval targets the token');
  assert.ok(prepared.tx.data.startsWith('0x095ea7b3'), 'approve selector');
});

test('prepareTransaction warns when allowance is insufficient', async () => {
  const prepared = await prepareTransaction(
    { opportunityId: 7, walletAddress: WALLET, amount: '5', type: 'deposit' },
    baseOverrides({ provider: providerFakes({ allowance: 1000000n }) }),
  );
  assert.ok(prepared.warnings.some((w) => w.toLowerCase().includes('allowance')));
});

test('prepareTransaction warns when balance is below the deposit', async () => {
  const prepared = await prepareTransaction(
    { opportunityId: 7, walletAddress: WALLET, amount: '5', type: 'deposit' },
    baseOverrides({ provider: providerFakes({ balance: 1000000n }) }),
  );
  assert.ok(prepared.warnings.some((w) => w.toLowerCase().includes('balance')));
});

test('risk gate blocks insufficient-data opportunities', async () => {
  await assert.rejects(
    () =>
      prepareTransaction(
        { opportunityId: 7, walletAddress: WALLET, amount: '1', type: 'deposit' },
        baseOverrides({
          opportunityRepository: {
            findById: async () => opportunity({ eligibility: 'insufficient-data' }),
          },
        }),
      ),
    (err) => err.code === 'RISK_GATE',
  );
});

test('risk gate blocks high-risk opportunities', async () => {
  await assert.rejects(
    () =>
      prepareTransaction(
        { opportunityId: 7, walletAddress: WALLET, amount: '1', type: 'deposit' },
        baseOverrides({ opportunityRepository: { findById: async () => opportunity({ risk: 'high' }) } }),
      ),
    (err) => err.code === 'RISK_GATE',
  );
});

test('prepare refuses when no contract deployment exists on the chain', async () => {
  await assert.rejects(
    () =>
      prepareTransaction(
        { opportunityId: 7, walletAddress: WALLET, amount: '1', type: 'deposit' },
        baseOverrides({ getGuardianContracts: async () => null }),
      ),
    (err) => err.code === 'NOT_DEPLOYED',
  );
});

test('prepare validates wallet and amount strictly', async () => {
  await assert.rejects(
    () => prepareTransaction({ opportunityId: 7, walletAddress: 'not-an-address', amount: '1' }, baseOverrides()),
    (err) => err.code === 'INVALID_WALLET',
  );
  await assert.rejects(
    () =>
      prepareTransaction(
        { opportunityId: 7, walletAddress: WALLET, amount: '1.0000001', type: 'deposit' },
        baseOverrides(),
      ),
    (err) => err.code === 'INVALID_AMOUNT',
  );
});

test('recordUserTransaction stamps a signed hash and lifecycle follows', async () => {
  const signed = await recordUserTransaction(
    'abc123',
    { txHash: '0x' + 'ab'.repeat(32), status: 'signed' },
    baseOverrides({
      transactionRepository: repoFakes({
        seed: buildRecord(),
      }).transactionRepository,
    }),
  );
  assert.equal(signed.status, 'signed');
  assert.equal(signed.txHash, '0x' + 'ab'.repeat(32));
  assert.ok(signed.signedAt);
});

test('recordUserTransaction rejects malformed hashes', async () => {
  await assert.rejects(
    () => recordUserTransaction('abc123', { txHash: '0xdeadbeef' }, baseOverrides()),
    (err) => err.code === 'INVALID_TX_HASH',
  );
});

test('verifyTransactionState confirms a successful receipt and reads back state', async () => {
  const receipt = {
    hash: '0x' + 'ab'.repeat(32),
    status: 'success',
    blockNumber: 42,
    gasUsed: 120000n,
    effectiveGasPrice: 120n,
    from: WALLET,
    to: VAULT.address,
    logs: [],
  };
  const logs = [
    {
      address: VAULT.address.toLowerCase(),
      transactionHash: '0x' + 'ab'.repeat(32),
      data: '0x' + '00'.repeat(64) + 'ff'.repeat(32),
    },
  ];
  const vaultState = {
    totalAssets: '1500000',
    totalSupply: '1500000',
    sharesOf: '1500000',
    asset: TOKEN.address,
    strategy: STRATEGY.address,
    tokenSupported: true,
    paused: false,
    exchangeRateRaw: 1,
  };
const result = await verifyTransactionState(
    'abc123',
    baseOverrides({
      provider: providerFakes({ receipt, logs, vaultState }),
      transactionRepository: repoFakes({
        seed: buildRecord({ txHash: '0x' + 'ab'.repeat(32) }),
      }).transactionRepository,
    }),
  );
  assert.equal(result.status, 'success');
  assert.equal(result.blockNumber, 42);
  assert.equal(result.confirmedAt instanceof Date, true);
  assert.equal(result.verification.mined, true);
  assert.equal(result.verification.onChain.vaultState.totalAssets, '1500000');
  assert.equal(result.verification.onChain.events.length, 1);
});

test('verifyTransactionState flags a reverting receipt failed', async () => {
  const receipt = { hash: '0x' + 'cd'.repeat(32), status: 'failed', blockNumber: 3, gasUsed: 90000n, effectiveGasPrice: 1n, from: WALLET, to: VAULT.address };
  const result = await verifyTransactionState(
    'abc123',
    baseOverrides({
      provider: providerFakes({ receipt }),
      transactionRepository: repoFakes({
        seed: buildRecord({ txHash: '0x' + 'ab'.repeat(32) }),
      }).transactionRepository,
    }),
  );
  assert.equal(result.verification.receipt.status, 'failed');
  assert.equal(result.status, 'failed');
  assert.ok(result.errorMessage);
});

test('getTransactionStatus 404s for unknown prepare ids', async () => {
  await assert.rejects(
    () => getTransactionStatus('nope', baseOverrides()),
    (err) => err.code === 'NOT_FOUND',
  );
});

test('recordUserTransaction refuses an expired preparation', async () => {
  await assert.rejects(
    () =>
      recordUserTransaction(
        'abc123',
        { txHash: '0x' + 'ab'.repeat(32), status: 'signed' },
        baseOverrides({
          transactionRepository: repoFakes({
            seed: buildRecord({ validUntil: new Date(Date.now() - 1000) }),
          }).transactionRepository,
        }),
      ),
    (err) => err.code === 'PREPARATION_EXPIRED',
  );
});

test('recordUserTransaction refuses an already-expired record', async () => {
  await assert.rejects(
    () =>
      recordUserTransaction(
        'abc123',
        { txHash: '0x' + 'ab'.repeat(32), status: 'signed' },
        baseOverrides({
          transactionRepository: repoFakes({
            seed: buildRecord({ status: 'expired' }),
          }).transactionRepository,
        }),
      ),
    (err) => err.code === 'PREPARATION_EXPIRED',
  );
});

test('verifyTransactionState refuses an expired preparation', async () => {
  await assert.rejects(
    () =>
      verifyTransactionState(
        'abc123',
        baseOverrides({
          transactionRepository: repoFakes({
            seed: buildRecord({ status: 'expired', txHash: '0x' + 'ab'.repeat(32) }),
          }).transactionRepository,
        }),
      ),
    (err) => err.code === 'PREPARATION_EXPIRED',
  );
});