// On-chain opportunity discovery — hermetic tests (no RPC, no DB).
// Covers: keccak vectors, ABI decoders, chain validation, share-price APY,
// and the rankable-record builder.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keccak256, keccakFunctionSelector } from '../src/onchain/keccak.js';
import {
  strategyRegisteredTopic,
  REGISTRY_SELECTORS,
  decodeStrategyRegistered,
  decodeRegistrationCallResult,
} from '../src/onchain/registryAbi.js';
import { validateRegistration } from '../src/onchain/validator.js';
import { estimateApyFromSamples, pickTwoMostRecent } from '../src/onchain/shareApy.js';
import { buildDiscoveredOpportunity } from '../src/onchain/buildOpportunity.js';
import { discoverOnChain } from '../src/onchain/discoveryService.js';
import { SELECTORS } from '../../security-layer/backend/provider.js';

// ------------------------------------------------------------------ //
// Small ABI encoders for building fixtures
// ------------------------------------------------------------------ //
const pad = (hex, bytes = 32) => hex.padStart(bytes * 2, '0');
const wAddr = (a) => pad(BigInt(a).toString(16));
const wUint = (n) => pad(BigInt(n).toString(16));
const strTail = (s) => {
  const b = Buffer.from(s, 'utf8');
  return wUint(b.length) + b.toString('hex').padEnd(64, '0');
};

const STRATEGY = '0x1111111111111111111111111111111111111111';
const VAULT = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const NAME = 'Alpha';
const DESC = 'Test Project';
const META = 'https://x.example';
const REGISTERED_AT = 1710000000;

// ------------------------------------------------------------------ //
// keccak256
// ------------------------------------------------------------------ //
test('keccak256 matches canonical vectors', () => {
  assert.equal(
    keccak256(''),
    '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  );
  assert.equal(
    keccak256('abc'),
    '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
  );
});

test('keccakFunctionSelector returns the public ABI selectors', () => {
  assert.equal(keccakFunctionSelector('registrationsCount()'), '0xaa6cb71d');
  assert.equal(keccakFunctionSelector('registrations(uint256)'), '0xf4ddb5be');
  assert.equal(keccakFunctionSelector('byStrategy(address)'), '0xb8b52b60');
  assert.ok(REGISTRY_SELECTORS.registrationsCount.startsWith('0x'));
});

// ------------------------------------------------------------------ //
// ABI decoders
// ------------------------------------------------------------------ //
function eventFixture() {
  const data =
    wUint(128) + wUint(192) + wUint(256) + wUint(REGISTERED_AT) +
    strTail(NAME) + strTail(DESC) + strTail(META);
  return {
    topics: [`0x${'ab'.repeat(32)}`, wAddr(STRATEGY), wAddr(VAULT), wAddr(TOKEN)],
    data,
  };
}

test('decodeStrategyRegistered decodes an emitted log', () => {
  const { topics, data } = eventFixture();
  const reg = decodeStrategyRegistered(topics, `0x${data}`);
  assert.equal(reg.strategy, STRATEGY);
  assert.equal(reg.vault, VAULT);
  assert.equal(reg.token, TOKEN);
  assert.equal(reg.name, NAME);
  assert.equal(reg.description, DESC);
  assert.equal(reg.metadataUri, META);
  assert.equal(reg.registeredAt, String(REGISTERED_AT));
});

test('decodeStrategyRegistered rejects malformed logs', () => {
  assert.equal(decodeStrategyRegistered([], '0x'), null);
  assert.equal(decodeStrategyRegistered('nope', '0x'), null);
  assert.equal(decodeStrategyRegistered(['0x', '0x', '0x'], '0x'), null);
});

test('decodeRegistrationCallResult decodes a registrations(i) read', () => {
  const struct =
    wAddr(STRATEGY) + wAddr(VAULT) + wAddr(TOKEN) +
    wUint(224) + wUint(288) + wUint(352) + wUint(REGISTERED_AT) +
    strTail(NAME) + strTail(DESC) + strTail(META);
  const reg = decodeRegistrationCallResult(`0x${wUint(32)}${struct}`);
  assert.equal(reg.strategy, STRATEGY);
  assert.equal(reg.vault, VAULT);
  assert.equal(reg.token, TOKEN);
  assert.equal(reg.name, NAME);
  assert.equal(reg.description, DESC);
  assert.equal(reg.metadataUri, META);
  assert.equal(reg.registeredAt, String(REGISTERED_AT));
});

test('strategyRegisteredTopic is stable and 32 bytes', () => {
  const topic = strategyRegisteredTopic();
  assert.ok(topic.startsWith('0x'));
  assert.equal(topic.length, 66);
});

// ------------------------------------------------------------------ //
// On-chain validation (mock provider)
// ------------------------------------------------------------------ //
const REG = {
  strategy: STRATEGY,
  vault: VAULT,
  token: TOKEN,
  name: NAME,
  description: DESC,
};

function mockProvider(overrides = {}) {
  const base = {
    SELECTORS,
    getCode: async () => ({ deployed: true, bytecodeLength: 300 }),
    callBoolean: async (_n, _to, sel) => sel !== SELECTORS.paused,
    callAddress: async (_n, _to, sel) =>
      sel === SELECTORS.asset ? TOKEN.toLowerCase() : STRATEGY.toLowerCase(),
    callWord: async (_n, _to, sel) =>
      sel === SELECTORS.totalSupply ? 100_000n : sel === SELECTORS.previewRedeem ? 1n : 0n,
    getTokenDecimals: async () => 18,
    getTokenSymbol: async () => 'TKN',
  };
  return { ...base, ...overrides };
}

test('validateRegistration passes a fully valid registration', async () => {
  const result = await validateRegistration(REG, { networkId: 'ethereum', provider: mockProvider() });
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.checks.isGuardianStrategy, true);
  assert.equal(result.checks.asset, TOKEN.toLowerCase());
  assert.equal(result.checks.strategy, STRATEGY.toLowerCase());
});

test('validateRegistration fails a non-Guardian strategy / bad wiring', async () => {
  const result = await validateRegistration(REG, {
    networkId: 'ethereum',
    provider: mockProvider({
      callBoolean: async () => false,
      callAddress: async (_n, _to, sel) => sel === SELECTORS.asset ? '0x9999999999999999999999999999999999999999' : STRATEGY.toLowerCase(),
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.join(' ').includes('isGuardianStrategy'));
  assert.ok(result.reasons.join(' ').includes('asset'));
});

test('validateRegistration fails a paused vault and an unreadable token', async () => {
  const result = await validateRegistration(REG, {
    networkId: 'ethereum',
    provider: mockProvider({
      callBoolean: async () => true, // Guardian marker ok, but paused = true
      getTokenDecimals: async () => { throw new Error('boom'); },
      getTokenSymbol: async () => '',
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.join(' ').includes('paused'));
  assert.ok(result.reasons.join(' ').includes('decimals'));
});

test('validateRegistration fails when a contract has no bytecode', async () => {
  const result = await validateRegistration(REG, {
    networkId: 'ethereum',
    provider: mockProvider({
      getCode: async (_n, addr) => {
        const deployed = addr === STRATEGY.toLowerCase();
        return { deployed, bytecodeLength: deployed ? 300 : 0 };
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.join(' ').includes('vault has no bytecode'));
  assert.ok(result.reasons.join(' ').includes('token has no bytecode'));
});

test('validateRegistration rejects a broken exchange rate', async () => {
  const result = await validateRegistration(REG, {
    networkId: 'ethereum',
    provider: mockProvider({
      callWord: async (_n, _to, sel) =>
        sel === SELECTORS.totalSupply ? 1_000n : sel === SELECTORS.previewRedeem ? 0n : 0n,
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.join(' ').includes('redeems 0 assets'));
});

// ------------------------------------------------------------------ //
// Share-price APY (no external oracle)
// ------------------------------------------------------------------ //
test('estimateApyFromSamples annualizes per-share growth', () => {
  const apy = estimateApyFromSamples(
    { blockNo: 100, totalAssets: '1000', totalSupply: '1000' },
    { blockNo: 900_100, totalAssets: '1050', totalSupply: '1000' }, // 125 days at 12s
  );
  assert.ok(apy > 15 && apy < 16, `apy=${apy}`);
});

test('estimateApyFromSamples returns 0 for flat share price', () => {
  const apy = estimateApyFromSamples(
    { blockNo: 0, totalAssets: '1010', totalSupply: '1000' },
    { blockNo: 1_000_000, totalAssets: '1010', totalSupply: '1000' },
  );
  assert.equal(apy, 0);
});

test('estimateApyFromSamples is null until there is real elapsed time', () => {
  const apy = estimateApyFromSamples(
    { blockNo: 10, totalAssets: '1000', totalSupply: '1000' },
    { blockNo: 20, totalAssets: '1050', totalSupply: '1000' }, // < 1 day
  );
  assert.equal(apy, null);
});

test('estimateApyFromSamples guards zero/empty samples', () => {
  assert.equal(estimateApyFromSamples(null, { blockNo: 1, totalAssets: '1', totalSupply: '1' }), null);
  assert.equal(
    estimateApyFromSamples({ blockNo: 0, totalAssets: '1', totalSupply: '0' }, { blockNo: 100, totalAssets: '1', totalSupply: '1' }),
    null,
  );
});

test('pickTwoMostRecent selects the oldest and newest samples', () => {
  const pair = pickTwoMostRecent([
    { blockNo: 10 },
    { blockNo: 30 },
    { blockNo: 20 },
  ]);
  assert.equal(pair.older.blockNo, 10);
  assert.equal(pair.newer.blockNo, 30);
  assert.equal(pickTwoMostRecent([{ blockNo: 1 }]), null);
});

// ------------------------------------------------------------------ //
// Rankable record builder
// ------------------------------------------------------------------ //
test('buildDiscoveredOpportunity produces a source=onchain record', () => {
  const validation = {
    checks: { tokenSymbol: 'TKN', tokenDecimals: 6, paused: false },
    codeLengths: { strategy: 400, vault: 500, token: 200 },
  };
  const opportunity = buildDiscoveredOpportunity({
    registration: { ...REG, metadataUri: META, registeredAt: String(REGISTERED_AT) },
    validation,
    apy: null,
    networkId: 'ethereum',
    chainId: 1,
    lastUpdated: '2026-09-10T00:00:00.000Z',
    tokenSymbol: 'TKN',
    tokenDecimals: 6,
  });

  assert.equal(opportunity.source, 'onchain');
  assert.equal(opportunity.slug, `onchain:1:${STRATEGY.toLowerCase()}`);
  assert.equal(opportunity.strategyAddress, STRATEGY.toLowerCase());
  assert.equal(opportunity.metadataUri, META);
  assert.equal(opportunity.registeredAt, String(REGISTERED_AT));
  assert.equal(opportunity.contractAddress, VAULT);
  assert.equal(opportunity.apy, null, 'yield never invented');
  assert.equal(opportunity.tvlUsd, null, 'TVL never fabricated');
  assert.equal(opportunity.eligibility, 'eligible');
  assert.ok(opportunity.dataSources.some((s) => s.provider === 'on-chain-registry'));
  assert.equal(opportunity.metrics.currentYield, 0);
});

test('buildDiscoveredOpportunity carries the measured apy when available', () => {
  const opportunity = buildDiscoveredOpportunity({
    registration: REG,
    validation: { checks: { tokenSymbol: 'TKN', tokenDecimals: 18 }, codeLengths: {} },
    apy: 12.34,
    networkId: 'ethereum',
    chainId: 1,
    lastUpdated: new Date().toISOString(),
    tokenSymbol: 'TKN',
    tokenDecimals: 18,
  });
  assert.equal(opportunity.apy, 12.34);
  assert.ok(opportunity.whyGuardianLikes.includes('12.34'));
});

// ------------------------------------------------------------------ //
// Module graph smoke (imports resolve across the security-layer seam)
// ------------------------------------------------------------------ //
test('discoveryService module graph loads', () => {
  assert.equal(typeof discoverOnChain, 'function');
  assert.ok(SELECTORS.asset.startsWith('0x'));
});