// Protocol provider — real yield / TVL data from DefiLlama (public API, no
// key). Only the pools and protocols registered in Web3 Data/opportunities.json
// are ever requested, so the app never downloads the whole ecosystem per
// request: the /pools snapshot is fetched once per TTL window and shared.

import { requestJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { get as cacheGet, set as cacheSet, KINDS } from '../cache/cacheService.js';

const PROVIDER = 'decentralized-llama';

const YIELDS_URL = 'https://yields.llama.fi/pools';
const PROTOCOL_URL = (slug) => `https://api.llama.fi/protocol/${slug}`;

const SNAPSHOT_KEY = 'snapshot:yields';
const SNAPSHOT_MAX_AGE_MS = 4 * 60 * 1000;

let poolsSnapshot = null; // in-process memo (per provider lifetime)
let poolsSnapshotAt = 0;

/**
 * Load the DefiLlama yields snapshot. The snapshot is large, so it is shared
 * through Redis across processes and reused within the TTL window. Cold
 * downloads tolerate slow networks with generous timeouts.
 */
async function loadSnapshot() {
  const now = Date.now();
  if (poolsSnapshot && now - poolsSnapshotAt <= SNAPSHOT_MAX_AGE_MS) {
    return poolsSnapshot;
  }
  const cached = await cacheGet(SNAPSHOT_KEY, KINDS.yields);
  if (Array.isArray(cached) && cached.length) {
    poolsSnapshot = cached;
    poolsSnapshotAt = now;
    return poolsSnapshot;
  }
  const payload = await requestJson(YIELDS_URL, {
    provider: 'decentralized-llama:yields',
    timeoutMs: 60000,
    retries: 2,
  });
  if (!Array.isArray(payload?.data)) {
    throw new Error('Unexpected DefiLlama yields response shape');
  }
  poolsSnapshot = payload.data;
  poolsSnapshotAt = now;
  await cacheSet(SNAPSHOT_KEY, poolsSnapshot, KINDS.yields);
  logger.info(`DefiLlama yields snapshot refreshed (${poolsSnapshot.length} pools)`);
  return poolsSnapshot;
}

/**
 * Fetch a single pool record from DefiLlama yields by pool uuid.
 * @returns {null | {id, symbol, project, chain, apy, apyBase, tvlUsd,
 *           rewardTokens, poolMeta, ilRisk}} — null when not found.
 */
export async function fetchPoolYield(poolId, options = {}) {
  const pools = await loadSnapshot();
  const match = pools.find((p) => p.pool === poolId);
  if (!match) {
    logger.warn(`DefiLlama pool not found: ${poolId}`);
    return null;
  }

  return {
    id: match.pool,
    symbol: match.symbol,
    project: match.project,
    chain: match.chain,
    apy: finiteOrNull(match.apy, 'apy'),
    apyBase: finiteOrNull(match.apyBase, 'apyBase'),
    tvlUsd: finiteOrNull(match.tvlUsd, 'tvlUsd'),
    rewardTokens: Array.isArray(match.rewardTokens) ? match.rewardTokens : [],
    poolMeta: match.poolMeta || null,
    ilRisk: match.ilRisk ?? null,
  };
}

/**
 * Fetch protocol-level TVL from DefiLlama for a protocol slug.
 * @returns {null | {tvl, chainTvl}} — null on failure (fail-soft).
 */
export async function fetchProtocolTvl(projectSlug, options = {}) {
  if (!projectSlug) return null;
  try {
    const payload = await requestJson(PROTOCOL_URL(projectSlug), {
      provider: 'decentralized-llama:protocol',
      timeoutMs: 20000,
      retries: 1,
      ...options,
    });
    if (!payload || typeof payload.tvl !== 'number') return null;

    const chainTvl =
      payload.currentChainTvls?.[payload.chains?.[0] || 'Ethereum'] ?? null;
    return {
      tvl: payload.tvl,
      chain: payload.chains?.[0] || null,
      chainTvl: typeof chainTvl === 'number' ? chainTvl : null,
    };
  } catch (err) {
    logger.warn(`DefiLlama protocol TVL failed for ${projectSlug}`, {
      message: err.message,
    });
    return null;
  }
}

function finiteOrNull(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    logger.warn(`DefiLlama pool field non-finite: ${label}=${value}`);
    return null;
  }
  return n;
}

export { PROVIDER };