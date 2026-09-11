import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkExecutionFunding } from '../backend/funding.js';

const TOKEN = { address: '0x9999999999999999999999999999999999999999', decimals: 6 };
const VAULT = { address: '0x1111111111111111111111111111111111111111' };
const WALLET = '0x2222222222222222222222222222222222222222';
const CONTRACTS = { token: TOKEN, vault: VAULT, strategy: { address: '0x3333333333333333333333333333333333333333' } };

function cfg({ walletAddress = WALLET, mode = 'keeperhub' } = {}) {
  return { walletAddress, walletAddressValid: !walletAddress || /^0x[a-fA-F0-9]{40}$/.test(walletAddress), executionMode: mode };
}

function p6({ gas = '10000000000000000' } = {}) {
  return { minGasWei: gas, preflightFunding: true, executionRequired: false, effectiveMode: 'keeperhub' };
}

function deps({ chain = true, contracts = CONTRACTS, balances = {}, allow = '0' } = {}) {
  return {
    getPhase6Config: () => p6(),
    getConfig: () => cfg(),
    loadSepoliaContracts: async () => contracts,
    probeChain: async () => ({ chainId: 11155111, expected: 11155111, ok: chain, latestBlock: 1 }),
    balanceFns: {
      native: async () => balances.native ?? '5000000000000000000',
      token: async () => balances.token ?? '1000000000000000000',
      allowance: async () => balances.allowance ?? allow,
    },
  };
}

test('wallet not configured → not_configured', async () => {
  const r = await checkExecutionFunding({}, {
    ...deps(),
    getConfig: () => cfg({ walletAddress: '' }),
  });
  assert.equal(r.state, 'not_configured');
  assert.equal(r.ready, false);
});

test('invalid wallet → wallet_invalid', async () => {
  const r = await checkExecutionFunding({}, {
    ...deps(),
    getConfig: () => cfg({ walletAddress: '0xbad' }),
  });
  assert.equal(r.state, 'wallet_invalid');
});

test('chain wrong → chain_unreachable', async () => {
  const r = await checkExecutionFunding({}, deps({ chain: false }));
  assert.equal(r.state, 'chain_unreachable');
});

test('no contracts → deployment_missing', async () => {
  const r = await checkExecutionFunding({}, deps({ contracts: null }));
  assert.equal(r.state, 'deployment_missing');
});

test('low native balance → insufficient_gas', async () => {
  const r = await checkExecutionFunding({}, deps({ balances: { native: '1000000000' } }));
  assert.equal(r.state, 'insufficient_gas');
  assert.equal(r.ready, false);
});

test('token below amount → insufficient_token_balance', async () => {
  const r = await checkExecutionFunding(
    { amountRaw: '2000000000' },
    deps({ balances: { token: '1000000000' } }),
  );
  assert.equal(r.state, 'insufficient_token_balance');
});

test('allowance below amount → insufficient_allowance', async () => {
  const r = await checkExecutionFunding(
    { amountRaw: '1000000000' },
    deps({ balances: { token: '1000000000' }, allow: '500000000' }),
  );
  assert.equal(r.state, 'insufficient_allowance');
});

test('fully funded deposit → ready with real evidence', async () => {
  const r = await checkExecutionFunding(
    { amountRaw: '1000000000' },
    deps({ balances: { token: '5000000000' }, allow: '5000000000' }),
  );
  assert.equal(r.state, 'ready');
  assert.equal(r.ready, true);
  assert.ok(r.evidence.nativeEth.includes('5'));
  assert.equal(r.evidence.tokenBalanceHuman, '5000');
});

test('balance read failure → chain_unreachable (no conclusion)', async () => {
  const r = await checkExecutionFunding({}, {
    ...deps(),
    balanceFns: {
      native: async () => null,
      token: async () => null,
      allowance: async () => '0',
    },
  });
  assert.equal(r.state, 'chain_unreachable');
  assert.match(r.detail, /No funding conclusion/);
});

test('withdraw without user share allowance → insufficient_allowance', async () => {
  const r = await checkExecutionFunding(
    { operation: 'withdraw', amountRaw: '1000000000', ownerAddress: WALLET },
    {
      ...deps({ balances: { token: '5000000000' } }),
      balanceFns: {
        native: async () => '5000000000000000000',
        token: async () => '1000000000000000000', // owner vault shares
        allowance: async () => '0',               // shares approved to keeperhub
      },
    },
  );
  assert.equal(r.evidence.withdraw.owner, WALLET.toLowerCase());
  assert.equal(r.state, 'insufficient_allowance');
});

test('withdraw with enough shares + allowance → ready', async () => {
  const r = await checkExecutionFunding(
    { operation: 'withdraw', amountRaw: '1000000000', ownerAddress: WALLET },
    {
      ...deps({ balances: { token: '5000000000' } }),
      balanceFns: {
        native: async () => '5000000000000000000',
        token: async () => '5000000000000000000',
        allowance: async () => '5000000000000000000',
      },
    },
  );
  assert.equal(r.state, 'ready');
});