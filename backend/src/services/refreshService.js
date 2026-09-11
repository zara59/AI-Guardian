// Refresh coordination — the single place that reasons about freshness and
// runs the provider pipeline. Single-flight guarantees concurrent callers
// (e.g. many dashboards hitting /api/opportunities at once) share one fetch
// instead of stampeding the RPC / provider APIs.

import { config } from '../config/index.js';
import { fetchAllOpportunityData } from '../external/index.js';
import { bumpCacheVersion } from '../cache/cacheService.js';
import * as opportunityRepository from '../repositories/opportunityRepository.js';
import { discoverOnChain } from '../onchain/discoveryService.js';
import { runWebFeed } from '../onchain/webFeed.js';
import { loadNetworks } from '../config/networks.js';
import { getGuardianRegistry } from '../config/contracts.js';
import { logger } from '../utils/logger.js';

let refreshPromise = null;
let lastCompletedAt = null;

function windowMs() {
  return (config.cacheTtl.opportunity || 120) * 1000;
}

function expiredBy(now = Date.now()) {
  if (lastCompletedAt === null) return true;
  return now - lastCompletedAt >= windowMs();
}

/**
 * Run the full real-data pipeline and persist results.
 * Throws on total failure (used by the explicit refresh endpoint).
 */
export async function refreshOpportunities({ force = false } = {}) {
  if (refreshPromise) return refreshPromise;

  if (!force && !expiredBy()) {
    return { skipped: true, at: new Date(lastCompletedAt).toISOString() };
  }

  refreshPromise = (async () => {
    const started = Date.now();
    try {
      const records = await fetchAllOpportunityData();
      let upserted = 0;
      for (const record of records) {
        await opportunityRepository.insert(record);
        upserted += 1;
      }
      const removed = await opportunityRepository.removeStaleSlugs(
        records.map((r) => r.slug),
      );
      // On-chain discovery (filter-for-web3): run on every chain that has a
      // deployed GuardianRegistry. Additive and fail-soft per chain.
      const discovery = await runDiscoveryPipelines();
      // Web → web3 feed: surface new pool creations chain-wide and screen
      // them on-chain (works even before any GuardianRegistry is deployed).
      const webfeed = await runWebFeedPipelines();
      await bumpCacheVersion();
      lastCompletedAt = Date.now();
      logger.info('Opportunity refresh completed', {
        upserted,
        removed,
        durationMs: Date.now() - started,
      });
      return {
        refreshed: upserted,
        removed,
        source: 'providers',
        discovery,
        webfeed,
        started: new Date(started).toISOString(),
        completed: new Date(lastCompletedAt).toISOString(),
        durationMs: Date.now() - started,
      };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Fail-soft freshness gate: returns a refresh report but never throws.
 * Callers (opportunity listing, ranking) continue against the persisted
 * PostgreSQL snapshot when providers are unreachable.
 */
export async function ensureFresh({ force = false } = {}) {
  if (!force && !expiredBy()) {
    return { skipped: true, at: new Date(lastCompletedAt).toISOString() };
  }
  try {
    return await refreshOpportunities({ force: true });
  } catch (err) {
    logger.warn('Freshness refresh failed; serving persisted snapshot', {
      message: err.message,
    });
    return { failed: true, message: err.message };
  }
}

/**
 * Milliseconds since the opportunity's last successful provider update.
 */
export function freshnessOf(row) {
  if (!row || !row.lastUpdated) return null;
  const updated = new Date(row.lastUpdated).getTime();
  return Math.max(0, Date.now() - updated);
}

export function lastCompletedRefresh() {
  return lastCompletedAt;
}

/**
 * Run the on-chain discovery pipeline on every configured chain that has a
 * deployed GuardianRegistry (ethereum, sepolia could both be enabled once
 * deployed). Fail-soft: one chain failing never blocks the others.
 */
export async function runDiscoveryPipelines() {
  const { all } = await loadNetworks();
  const summaries = [];
  for (const network of all()) {
    try {
      const registryInfo = await getGuardianRegistry(network.chainId);
      if (!registryInfo?.address) {
        summaries.push({
          chain: network.id,
          chainId: network.chainId,
          enabled: false,
          reason: 'GuardianRegistry not deployed on this chain yet.',
        });
        continue;
      }
      const report = await discoverOnChain({ networkId: network.id });
      summaries.push(report);
    } catch (err) {
      summaries.push({
        chain: network.id,
        chainId: network.chainId,
        enabled: false,
        error: err.message,
      });
    }
  }
  return summaries;
}

/**
 * Web → web3 feed: scan public pool-creation events on every configured chain
 * and screen the tokens on-chain. Unlike the registry discovery this does NOT
 * require a GuardianRegistry — it surfaces what the open chain is doing and
 * flags which pools trade an already-verified Guardian asset.
 * Fail-soft: one chain failing never blocks the others.
 */
export async function runWebFeedPipelines() {
  const { all } = await loadNetworks();
  const summaries = [];
  for (const network of all()) {
    try {
      const report = await runWebFeed({ networkId: network.id });
      summaries.push(report);
    } catch (err) {
      summaries.push({
        source: 'webfeed',
        chain: network.id,
        chainId: network.chainId,
        enabled: false,
        error: err.message,
      });
    }
  }
  return summaries;
}