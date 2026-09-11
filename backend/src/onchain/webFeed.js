// Web → Web3 filter layer ("filter the onchain opportunity on web, then move
// it to web3").
//
// Surfaces what is NEW in web3 from the public chain itself (no curated list,
// no aggregator):
//   - Uniswap V2 "PairCreated" events  — any factory, chain-wide
//   - Uniswap V3 "PoolCreated" events  — any factory, chain-wide
//
// Each candidate is screened web3-true, entirely on-chain:
//   - both tokens must exist, expose ERC-20 shape, decimals within 6..18
//   - a pool that trades the asset of an already Guardian-verified strategy
//     is flagged guardian_linked (the pool becomes live market context for a
//     verified asset)
//   - candidates that ALSO hold real live liquidity (V2 getReserves / V3
//     slot0+liquidity) qualify as LEGIT and are posted as rankable
//     opportunities (source='webfeed') with honest null yield/TVL and the raw
//     reserve evidence kept. This is the "the app qualifies it, then posts
//     it" step. Everything else stays in the screening queue with its status.

import { getNetwork } from '../config/networks.js';
import * as providerApi from '../external/blockchainProvider.js';
import * as discRepository from './discoveryRepository.js';
import * as oppRepository from '../repositories/opportunityRepository.js';
import { buildWebFeedOpportunity } from './buildOpportunity.js';
import { keccak256 } from './keccak.js';
import { logger } from '../utils/logger.js';

export const V2_PAIR_CREATED = 'PairCreated(address,address,address,uint256)';
export const V3_POOL_CREATED = 'PoolCreated(address,address,uint24,int24,address)';

export function pairCreatedTopic() {
  return keccak256(V2_PAIR_CREATED);
}

export function poolCreatedTopic() {
  return keccak256(V3_POOL_CREATED);
}

// Read-only pool-state selectors used to verify live liquidity on-chain.
export const V2_GET_RESERVES = 'getReserves()'; // -> (uint112, uint112, uint32) packed
export const V3_LIQUIDITY = 'liquidity()'; // -> uint128
export const V3_SLOT0 = 'slot0()'; // -> packed slot0 (sqrtPriceX96..unlocked)

export const SELECTORS = {
  getReserves: '0x0902f1ac',
  liquidity: '0x1a686502',
  slot0: '0x3850c7bd',
};

const MASK_128 = (1n << 128n) - 1n;

/** Split a raw eth_call hex response into 32-byte ABI words. */
function abiWords(rawHex) {
  return (String(rawHex || '').replace(/^0x/, '').match(/.{64}/g) || []).map(
    (w) => `0x${w}`,
  );
}

/**
 * Decode a getReserves() ABI response.
 * Solidity ABI-encodes the (uint112, uint112, uint32) return as three separate
 * right-aligned 32-byte words — NOT packed into a single word (packing is a
 * storage-layout detail, not the return encoding).
 */
export function decodeV2Reserves(rawHex) {
  const words = abiWords(rawHex);
  if (words.length < 3) throw new Error('getReserves response shorter than 3 words');
  return {
    reserveA: BigInt(words[0]),
    reserveB: BigInt(words[1]),
    timestampLast: Number(BigInt(words[2])),
  };
}

/**
 * Decode a slot0() ABI response (struct getter → one word per member).
 * sqrtPriceX96 = word 0 (uint160), tick = word 1 (int24, sign-extended).
 */
export function decodeV3Slot0(rawHex) {
  const words = abiWords(rawHex);
  if (words.length < 2) throw new Error('slot0 response shorter than 2 words');
  const sqrtPriceX96 = BigInt(words[0]);
  const rawTick = BigInt(words[1]) & 0xffffffn;
  const tick = rawTick & (1n << 23n) ? rawTick - (1n << 24n) : rawTick;
  return { sqrtPriceX96, tick: Number(tick) };
}

/**
 * Pure legitimacy classifier: does the pool hold REAL live liquidity right
 * now? (V2: both reserves non-zero · V3: liquidity() non-zero)
 * @returns {{hasLiquidity: boolean, summary: string|null}}
 */
export function classifyPoolLiquidity(evidence) {
  if (!evidence) return { hasLiquidity: false, summary: null };
  if (evidence.kind === 'v2') {
    return {
      hasLiquidity: evidence.reserveA > 0n && evidence.reserveB > 0n,
      summary: `V2 reserves ${evidence.reserveA.toString()} / ${evidence.reserveB.toString()}`,
    };
  }
  if (evidence.kind === 'v3') {
    return {
      hasLiquidity: evidence.liquidity > 0n,
      summary: `V3 liquidity ${evidence.liquidity.toString()} (tick ${evidence.tick})`,
    };
  }
  return { hasLiquidity: false, summary: null };
}

/** Read live pool liquidity (fail-soft: non-liquidity on error is not a lie). */
export async function readLiquidity(provider, networkId, candidate) {
  if (candidate.kind === 'v2') {
    try {
      const raw = await provider.callRaw(
        networkId,
        candidate.pool,
        SELECTORS.getReserves,
        [],
        RPC_OPTIONS,
      );
      return { kind: 'v2', error: null, ...decodeV2Reserves(raw) };
    } catch (err) {
      return { kind: 'v2', error: err.message, reserveA: 0n, reserveB: 0n, timestampLast: 0 };
    }
  }
  try {
    const [slotRaw, liquidity] = await Promise.all([
      provider.callRaw(networkId, candidate.pool, SELECTORS.slot0, [], RPC_OPTIONS),
      provider.callWord(networkId, candidate.pool, SELECTORS.liquidity, [], RPC_OPTIONS),
    ]);
    return {
      kind: 'v3',
      error: null,
      liquidity: liquidity & MASK_128,
      ...decodeV3Slot0(slotRaw),
    };
  } catch (err) {
    return { kind: 'v3', error: err.message, liquidity: 0n, sqrtPriceX96: 0n, tick: 0 };
  }
}

/** JSON-safe liquidity evidence (BigInts -> strings) for screening storage. */
export function serializeLiquidity(evidence) {
  if (!evidence) return null;
  if (evidence.kind === 'v2') {
    return {
      kind: 'v2',
      hasLiquidity: evidence.reserveA > 0n && evidence.reserveB > 0n,
      reserveA: evidence.reserveA.toString(),
      reserveB: evidence.reserveB.toString(),
      timestampLast: evidence.timestampLast,
      error: evidence.error || null,
    };
  }
  return {
    kind: 'v3',
    hasLiquidity: evidence.liquidity > 0n,
    liquidity: evidence.liquidity.toString(),
    sqrtPriceX96: evidence.sqrtPriceX96.toString(),
    tick: evidence.tick,
    error: evidence.error || null,
  };
}

/**
 * Re-qualify the backlog: candidates already token-screened but not yet posted
 * get their liquidity read now, and become opportunities once legit. Idempotent
 * — only rows with status 'screened' AND posted_slug IS NULL are touched.
 * @returns {Promise<number>} number of new posts made this pass
 */
export async function requalifyScreenedUnposted({ networkId = 'ethereum', deps = {} } = {}) {
  const provider = deps.provider || providerApi;
  const network = await getNetwork(networkId);
  const chainId = network.chainId;
  const rows = await discRepository.listScreenedUnposted({ chainId, limit: 300 });
  let postedCount = 0;
  await mapLimit(rows, SCREEN_CONCURRENCY, async (row) => {
    const candidate = {
      kind: row.kind,
      pool: row.pool,
      tokenA: row.tokenA,
      tokenB: row.tokenB,
      fee: row.fee,
      blockNo: row.blockNo,
    };
    const liquidity = await readLiquidity(provider, networkId, candidate);
    const legit = classifyPoolLiquidity(liquidity).hasLiquidity;
    await discRepository.updateWebCandidateLiquidity({
      chainId,
      kind: candidate.kind,
      pool: candidate.pool,
      liquidity: serializeLiquidity(liquidity),
      legit,
    });
    if (!legit) return;
    const opportunity = buildWebFeedOpportunity({
      candidate,
      checks: row.screening?.checks || {},
      liquidity,
      networkId,
      chainId,
      lastUpdated: new Date().toISOString(),
    });
    await oppRepository.insert(opportunity);
    await discRepository.markWebCandidatePosted({
      chainId,
      kind: candidate.kind,
      pool: candidate.pool,
      slug: opportunity.slug,
    });
    postedCount += 1;
  });
  return postedCount;
}

const FEED_LOOKBACK_BLOCKS = 20_000;
const MAX_CANDIDATES_PER_SCAN = 200; // honest per-run cap (report exposes it)
const LOGS_CHUNK_BLOCKS = 5_000; // free RPCs cap eth_getLogs range (50–10k)
const SCREEN_CONCURRENCY = 6; // bounded for public-RPC rate limits

// Bounded per-call latency for the firehose scan: a slow chunk should not
// multiply into minutes across failover × retries.
const RPC_OPTIONS = { retries: 1, timeoutMs: 8_000 };

/** Run `fn` over items with bounded concurrency, preserving order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Fetch logs for a topic over a range, splitting into chunks so range-limited
 * public RPCs still work. Fail-soft per chunk (returns what we already got).
 */
async function logsInRange(provider, networkId, topic, from, to) {
  const logs = [];
  let cursor = from;
  while (cursor <= to) {
    const end = Math.min(cursor + LOGS_CHUNK_BLOCKS - 1, to);
    try {
      const chunk = await provider.getLogs(
        networkId,
        { topics: [topic], fromBlock: cursor, toBlock: end },
        RPC_OPTIONS,
      );
      logs.push(...chunk);
    } catch (err) {
      logger.warn('web feed log chunk failed, keeping partial results', {
        networkId,
        from: cursor,
        to: end,
        message: err.message,
      });
      break;
    }
    if (end >= to) break;
    cursor = end + 1;
  }
  return logs;
}

function wordToAddress(hex) {
  const clean = String(hex || '').replace(/^0x/, '');
  if (clean.length < 40) return null;
  return `0x${clean.slice(clean.length - 40).toLowerCase()}`;
}

/**
 * Decode a Uniswap V2 PairCreated log.
 * topics: [sig, indexed token0, indexed token1]  ·  data: [pair, length]
 */
export function decodePairCreated(topics, data) {
  try {
    if (!Array.isArray(topics) || topics.length < 3) return null;
    const tokenA = wordToAddress(topics[1]);
    const tokenB = wordToAddress(topics[2]);
    const words = String(data || '').replace(/^0x/, '').match(/.{64}/g) || [];
    const pair = wordToAddress(words[0]);
    if (!tokenA || !tokenB || !pair) return null;
    return { tokenA, tokenB, pair, kind: 'v2', fee: null };
  } catch {
    return null;
  }
}

/**
 * Decode a Uniswap V3 PoolCreated log.
 * topics: [sig, indexed token0, indexed token1, indexed fee]
 * data:   [tickSpacing, pool]
 */
export function decodePoolCreated(topics, data) {
  try {
    if (!Array.isArray(topics) || topics.length < 4) return null;
    const tokenA = wordToAddress(topics[1]);
    const tokenB = wordToAddress(topics[2]);
    const feeRaw = topics[3].startsWith('0x') ? topics[3] : `0x${topics[3]}`;
    const fee = Number(BigInt(feeRaw)) & 0xffffff;
    const words = String(data || '').replace(/^0x/, '').match(/.{64}/g) || [];
    const pool = wordToAddress(words[1]);
    if (!tokenA || !tokenB || !pool) return null;
    return { tokenA, tokenB, pool, fee, kind: 'v3' };
  } catch {
    return null;
  }
}

/**
 * Pure screening classifier — testable without a provider.
 * @param {{a:{deployed,decimals,symbol}, b:{deployed,decimals,symbol}}} checks
 * @returns {{status:'screened'|'flagged', reasons:string[]}}
 */
export function classifyTokenScreening(checks) {
  const reasons = [];
  const tokenOk = (t, label) => {
    if (!t || !t.deployed) reasons.push(`${label} has no bytecode on chain`);
    if (!t || !Number.isInteger(t.decimals) || t.decimals < 6 || t.decimals > 18) {
      reasons.push(`${label} decimals out of range (${t?.decimals})`);
    }
    if (!t || !t.symbol) reasons.push(`${label} symbol unreadable`);
  };
  tokenOk(checks.a, 'tokenA');
  tokenOk(checks.b, 'tokenB');
  return { status: reasons.length ? 'flagged' : 'screened', reasons };
}

/** Screen one token (fail-soft). */
async function tokenScreen(provider, networkId, token) {
  const result = { token, deployed: false, decimals: null, symbol: null };
  try {
    const code = await provider.getCode(networkId, token);
    result.deployed = code.deployed;
  } catch (err) {
    result.error = err.message;
  }
  try {
    result.decimals = await provider.getTokenDecimals(networkId, token);
  } catch (err) {
    result.decimalsError = err.message;
  }
  try {
    result.symbol = await provider.getTokenSymbol(networkId, token);
  } catch (err) {
    result.symbolError = err.message;
  }
  return result;
}

/**
 * Run the web → web3 feed on one chain: scan pool creations, screen the
 * tokens, guardian-link and persist the queue. Fail-soft, never throws.
 */
export async function runWebFeed({ networkId = 'ethereum', deps = {} } = {}) {
  const provider = deps.provider || providerApi;
  const started = Date.now();
  const report = {
    source: 'webfeed',
    chain: networkId,
    enabled: false,
    scanned: null,
    pairs: 0,
    pools: 0,
    screened: 0,
    flagged: 0,
    legit: 0,
    posted: 0,
    backfilled: 0,
    guardianLinked: 0,
    candidates: 0,
    error: null,
  };

  try {
    const network = await getNetwork(networkId);
    const chainId = network.chainId;
    report.chainId = chainId;
    report.enabled = true;

    const [state, latest] = await Promise.all([
      discRepository.getWebFeedState(chainId),
      provider.getLatestBlock(networkId),
    ]);
    report.scannedTo = latest;
    const fromBlock = state?.lastBlock !== undefined && state?.lastBlock !== null
      ? Number(state.lastBlock)
      : Math.max(0, latest - FEED_LOOKBACK_BLOCKS);
    const toBlock = latest;
    report.scanned = [fromBlock, toBlock];

    const [pairs, pools] = await Promise.all([
      logsInRange(provider, networkId, pairCreatedTopic(), fromBlock, toBlock),
      logsInRange(provider, networkId, poolCreatedTopic(), fromBlock, toBlock),
    ]);

    const seen = new Map();
    for (const log of pairs) {
      const dec = decodePairCreated(log.topics, log.data);
      if (dec) seen.set(`v2:${dec.pair}`, { ...dec, pool: dec.pair, blockNo: log.blockNumber });
    }
    for (const log of pools) {
      const dec = decodePoolCreated(log.topics, log.data);
      if (dec) seen.set(`v3:${dec.pool}`, { ...dec, blockNo: log.blockNumber });
    }
    report.pairs = pairs.length;
    report.pools = pools.length;

    // Guardian assets already verified and posted — used to link pools that
    // trade a guarded asset (live market context for a verified project).
    // Keyed by the verified token ADDRESS (asset_address), not its symbol.
    const guardianByAsset = new Map();
    for (const row of await oppRepository.findOnChainAssets()) {
      if (row.assetAddress) guardianByAsset.set(row.assetAddress.toLowerCase(), row);
    }

    // Screen + persist every candidate with bounded concurrency, so the scan
    // stays fast against rate-limited public RPCs.
    report.capApplied = seen.size > MAX_CANDIDATES_PER_SCAN;
    const screened = await mapLimit(
      Array.from(seen.values()).slice(0, MAX_CANDIDATES_PER_SCAN),
      SCREEN_CONCURRENCY,
      async (candidate) => {
        try {
          if (candidate.tokenA === candidate.tokenB) return null; // junk pairs
          const [a, b] = await Promise.all([
            tokenScreen(provider, networkId, candidate.tokenA),
            tokenScreen(provider, networkId, candidate.tokenB),
          ]);
          const screening = classifyTokenScreening({ a, b });
          const guardian =
            guardianByAsset.get(candidate.tokenA.toLowerCase()) ||
            guardianByAsset.get(candidate.tokenB.toLowerCase());

          // Legit gate: BOTH tokens screened web3-true AND the live pool
          // holds real liquidity (getReserves / slot0+liquidity).
          let liquidity = null;
          let legit = false;
          if (screening.status === 'screened') {
            liquidity = await readLiquidity(provider, networkId, candidate);
            legit = classifyPoolLiquidity(liquidity).hasLiquidity;
          }

          const screeningRecord = {
            ...screening,
            checks: {
              a: { deployed: a.deployed, decimals: a.decimals, symbol: a.symbol },
              b: { deployed: b.deployed, decimals: b.decimals, symbol: b.symbol },
            },
            liquidity: serializeLiquidity(liquidity),
            legit,
            screenedAt: new Date().toISOString(),
          };

          await discRepository.insertWebCandidate({
            chainId,
            kind: candidate.kind,
            pool: candidate.pool,
            tokenA: candidate.tokenA,
            tokenB: candidate.tokenB,
            fee: candidate.fee,
            blockNo: candidate.blockNo,
            screening: screeningRecord,
            guardianLinked: Boolean(guardian),
            linkedSlug: guardian?.slug || null,
          });

          // "The app qualifies it (legit), then posts it": a legit candidate
          // becomes a rankable opportunity with honest null yield/TVL.
          let posted = null;
          if (legit) {
            const opportunity = buildWebFeedOpportunity({
              candidate,
              checks: screeningRecord.checks,
              liquidity,
              networkId,
              chainId,
              lastUpdated: screeningRecord.screenedAt,
            });
            await oppRepository.insert(opportunity);
            await discRepository.markWebCandidatePosted({
              chainId,
              kind: candidate.kind,
              pool: candidate.pool,
              slug: opportunity.slug,
            });
            posted = opportunity.slug;
          }

          return {
            status: screening.status,
            guardianLinked: Boolean(guardian),
            pool: candidate.pool,
            legit,
            posted,
          };
        } catch (err) {
          logger.warn('web feed candidate screening failed', {
            pool: candidate.pool,
            message: err.message,
          });
          return null;
        }
      },
    );
    report.candidates = screened.filter(Boolean).length;
    for (const r of screened) {
      if (!r) continue;
      if (r.status === 'screened') report.screened += 1;
      else report.flagged += 1;
      if (r.guardianLinked) report.guardianLinked += 1;
      if (r.legit) report.legit += 1;
      if (r.posted) report.posted += 1;
    }
    report.durationMs = Date.now() - started;

    // Qualify the backlog too: previously screened-but-unposted candidates are
    // re-tested for live liquidity and posted once legit (see requalify).
    report.backfilled = await requalifyScreenedUnposted({ networkId, deps: { provider } });

    await discRepository.upsertWebFeedState(chainId, latest);
    return report;
  } catch (err) {
    report.error = err.message;
    report.durationMs = Date.now() - started;
    return report;
  }
}