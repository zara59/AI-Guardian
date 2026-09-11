// Web → Web3 filter — hermetic tests (no RPC, no DB).
// Covers: V2/V3 log decoders, token screening classifier, and the public
// ABI selector constants.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  V2_PAIR_CREATED,
  V3_POOL_CREATED,
  pairCreatedTopic,
  poolCreatedTopic,
  decodePairCreated,
  decodePoolCreated,
  classifyTokenScreening,
  decodeV2Reserves,
  decodeV3Slot0,
  classifyPoolLiquidity,
  serializeLiquidity,
} from '../src/onchain/webFeed.js';

const ZERO_PAD_64 = '0'.repeat(64);
const addr = (hex) => `0x${hex.toLowerCase().padStart(40, '0')}`;
function padHex(int, len = 64) {
  return int.toString(16).padStart(len, '0');
}

const TOKEN_A = '0xaaaa'.padEnd(42, '0');
const TOKEN_B = '0xbbbb'.padEnd(42, '0');
const POOL = '0xcccc'.padEnd(42, '0');

// ------------------------------------------------------------------ //
// Topic selectors
// ------------------------------------------------------------------ //
test('pairCreatedTopic and poolCreatedTopic return 32-byte topic0s', () => {
  const v2 = pairCreatedTopic();
  const v3 = poolCreatedTopic();
  assert.ok(v2.startsWith('0x'));
  assert.equal(v2.length, 66);
  assert.equal(v3.length, 66);
});

// ------------------------------------------------------------------ //
// V2 decoder
// ------------------------------------------------------------------ //
test('decodePairCreated decodes a valid V2 log', () => {
  const topics = [
    '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9',
    addr('a1'),
    addr('b2'),
  ];
  const pair = addr('c3');
  const data = `0x${pair.slice(2).padStart(64, '0')}${padHex(42n)}`;
  const dec = decodePairCreated(topics, data);
  assert.equal(dec.kind, 'v2');
  assert.equal(dec.tokenA, addr('a1'));
  assert.equal(dec.tokenB, addr('b2'));
  assert.equal(dec.pair, pair);
  assert.equal(dec.fee, null);
});

test('decodePairCreated returns null for malformed logs', () => {
  assert.equal(decodePairCreated(null, null), null);
  assert.equal(decodePairCreated(['0x'], '0x'), null);
  assert.equal(decodePairCreated(['0x', addr('1'), addr('2')], '0x'), null);
});

// ------------------------------------------------------------------ //
// V3 decoder
// ------------------------------------------------------------------ //
test('decodePoolCreated decodes a valid V3 log including the indexed fee', () => {
  const fee = 3000;
  const topics = [
    '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
    addr('a1'),
    addr('b2'),
    padHex(fee),
  ];
  const tickSpacing = padHex(60n);
  const pool = addr('d4');
  const data = `0x${tickSpacing}${pool.slice(2).padStart(64, '0')}`;
  const dec = decodePoolCreated(topics, data);
  assert.equal(dec.kind, 'v3');
  assert.equal(dec.fee, 3000);
  assert.equal(dec.pool, addr('d4'));
  assert.equal(dec.tokenA, addr('a1'));
  assert.equal(dec.tokenB, addr('b2'));
});

test('decodePoolCreated returns null when data is truncated', () => {
  const topics = ['0x', addr('1'), addr('2'), padHex(100n)];
  assert.equal(decodePoolCreated(topics, '0x'), null);
});

// ------------------------------------------------------------------ //
// Screening classifier (pure)
// ------------------------------------------------------------------ //
test('classifyTokenScreening screens a valid pair', () => {
  const result = classifyTokenScreening({
    a: { deployed: true, decimals: 18, symbol: 'DAI' },
    b: { deployed: true, decimals: 6, symbol: 'USDC' },
  });
  assert.equal(result.status, 'screened');
  assert.deepEqual(result.reasons, []);
});

test('classifyTokenScreening flags a missing bytecode', () => {
  const result = classifyTokenScreening({
    a: { deployed: true, decimals: 18, symbol: 'ETH' },
    b: { deployed: false, decimals: 18, symbol: 'SCAM' },
  });
  assert.equal(result.status, 'flagged');
  assert.ok(result.reasons.join(' ').includes('tokenB has no bytecode'));
});

test('classifyTokenScreening flags bad decimals', () => {
  const result = classifyTokenScreening({
    a: { deployed: true, decimals: 4, symbol: 'WRONG' },
    b: { deployed: true, decimals: 18, symbol: 'OK' },
  });
  assert.equal(result.status, 'flagged');
  assert.ok(result.reasons.join(' ').includes('tokenA decimals'));
});

test('classifyTokenScreening flags a missing symbol', () => {
  const result = classifyTokenScreening({
    a: { deployed: true, decimals: 18, symbol: '' },
    b: { deployed: true, decimals: 18, symbol: 'OK' },
  });
  assert.equal(result.status, 'flagged');
  assert.ok(result.reasons.join(' ').includes('tokenA symbol'));
});

// ------------------------------------------------------------------ //
// Dynamic-string ABI decode (used for token symbols — the live feed bug
// where the ABI offset word was misread and NUL bytes crashed the JSONB
// insert).
// ------------------------------------------------------------------ //
test('decodeString handles the ABI offset layout and strips NUL bytes', async () => {
  const { decodeString } = await import('../../security-layer/backend/abi.js');
  const word = (hex) => `0x${hex.toLowerCase().padStart(64, '0')}`;
  const asciiHex = (s) =>
    Buffer.from(s, 'utf8').toString('hex');

  // Standard layout: [offset=0x20][length][data padded to 32]
  const symbol = 'PUGCOIN';
  const len = symbol.length;
  const dataHex = `${asciiHex(symbol)}${'0'.repeat(64 - len * 2)}`;
  const raw = `${'0'.repeat(62)}${'20'}${padHex(len)}${dataHex}`;
  assert.equal(decodeString(`0x${raw}`), symbol);

  // Raw "first word is the length" layout some tokens emit.
  assert.equal(decodeString(`0x${padHex(4)}${asciiHex('WETH')}${'0'.repeat(64 - 8)}`), 'WETH');

  // A decoded string containing NUL bytes must come back clean (Postgres
  // jsonb rejects \u0000 — the original live feed crash).
  const nulRaw = `0x${padHex(9)}${asciiHex('USDC')}${'0'.repeat(64 - 4 * 2)}`;
  assert.doesNotMatch(decodeString(nulRaw), /\u0000/);
});

// ------------------------------------------------------------------ //
// Live-liquidity decoders + legit classifier (the "qualify then post" gate)
// ------------------------------------------------------------------ //
test('decodeV2Reserves decodes the ABI getReserves response (3 right-aligned words)', () => {
  const reserveA = 4505695973922935319392664n;
  const reserveB = 1863345190774129777518n;
  const ts = 1789044971;
  const raw = `0x${padHex(reserveA.toString(16))}${padHex(reserveB.toString(16))}${padHex(ts.toString(16))}`;
  const dec = decodeV2Reserves(raw);
  assert.equal(dec.reserveA, reserveA);
  assert.equal(dec.reserveB, reserveB);
  assert.equal(dec.timestampLast, ts);
});

test('decodeV3Slot0 decodes the ABI slot0 response (sqrtPriceX96 word + signed tick word)', () => {
  const sqrtPriceX96 = (1n << 120n) + 12345n;
  const tick = -128;
  const raw = `0x${padHex(sqrtPriceX96.toString(16))}${padHex(((1n << 32n) + (BigInt(tick) & 0xffffffn)).toString(16))}`;
  const dec = decodeV3Slot0(raw);
  assert.equal(dec.sqrtPriceX96, sqrtPriceX96);
  assert.equal(dec.tick, -128);
});

test('classifyPoolLiquidity: V2 legit when both reserves are non-zero', () => {
  assert.equal(
    classifyPoolLiquidity({ kind: 'v2', reserveA: 1n, reserveB: 2n }).hasLiquidity,
    true,
  );
  assert.equal(
    classifyPoolLiquidity({ kind: 'v2', reserveA: 0n, reserveB: 2n }).hasLiquidity,
    false,
  );
  assert.equal(
    classifyPoolLiquidity({ kind: 'v2', reserveA: 1n, reserveB: 0n }).hasLiquidity,
    false,
  );
});

test('classifyPoolLiquidity: V3 legit only when liquidity() is non-zero', () => {
  assert.equal(
    classifyPoolLiquidity({ kind: 'v3', liquidity: 500000n, tick: 10 }).hasLiquidity,
    true,
  );
  assert.equal(
    classifyPoolLiquidity({ kind: 'v3', liquidity: 0n, tick: 0 }).hasLiquidity,
    false,
  );
  assert.equal(classifyPoolLiquidity(null).hasLiquidity, false);
});

test('serializeLiquidity keeps BigInts JSON-safe with an honest hasLiquidity flag', () => {
  const v2 = serializeLiquidity({ kind: 'v2', reserveA: 10n, reserveB: 20n, timestampLast: 5 });
  assert.deepEqual(v2, {
    kind: 'v2',
    hasLiquidity: true,
    reserveA: '10',
    reserveB: '20',
    timestampLast: 5,
    error: null,
  });
  const v3 = serializeLiquidity({ kind: 'v3', liquidity: 0n, sqrtPriceX96: 0n, tick: 0 });
  assert.equal(v3.hasLiquidity, false);
  assert.equal(v3.liquidity, '0');
});

// ------------------------------------------------------------------ //
// Module graph smoke
// ------------------------------------------------------------------ //
test('V2_PAIR_CREATED / V3_POOL_CREATED are non-empty selector strings', () => {
  assert.ok(V2_PAIR_CREATED.startsWith('PairCreated('));
  assert.ok(V3_POOL_CREATED.startsWith('PoolCreated('));
});