// Phase 3 data pipeline orchestrator.
//
// Real source → provider → validation → normalization → cache → analysis
// → structured opportunity records. Each opportunity is gathered
// independently so a single provider failure does not take down the whole
// sync (partial failure is kept usable; unsafe-to-evaluate opportunities are
// marked insufficient-data rather than fabricated).

import { loadOpportunityDefinitions } from './registry.js';
import { fetchPoolYield } from './protocolProvider.js';
import { fetchTokenPrices } from './marketProvider.js';
import * as blockchainProvider from './blockchainProvider.js';
import { evaluateSecurity } from './securityProvider.js';
import { inspectContracts } from './blockchainProvider.js';
import {
  normalizePool,
  normalizePrices,
  normalizeInspection,
} from './normalizers.js';
import { evaluateEligibility, computeDataConfidence } from './dataQuality.js';
import { analyzeOpportunity } from './analysis.js';
import { get as cacheGet, set as cacheSet, cacheKey, KINDS } from '../cache/cacheService.js';
import { logger } from '../utils/logger.js';

const failedSecurity = (message) => ({
  provider: 'on-chain-inspection',
  verificationStatus: 'unavailable',
  contractDeployed: null,
  contractCodeLength: null,
  tokenDecimals: null,
  upgradeability: 'unknown',
  ownership: 'unknown',
  pauseControl: 'unknown',
  notes: [message],
  retrievedAt: new Date().toISOString(),
});

async function cachedOrFetch(rawKey, fetchFn, kind) {
  const cached = await cacheGet(rawKey, kind);
  if (cached !== null) return cached;
  const value = await fetchFn();
  await cacheSet(rawKey, value, kind);
  return value;
}

/**
 * Gather + analyze one real opportunity from the registry.
 */
async function buildOpportunity(def, options = {}) {
  const retrievedAt = new Date().toISOString();
  const sources = [];
  let pool = null;
  let priceUsd = null;
  let normalizedInspection = null;

  try {
    const rawPool = await cachedOrFetch(
      `pool:${def.defiLlamaPoolId}`,
      () => fetchPoolYield(def.defiLlamaPoolId, options),
      KINDS.yields,
    );
    pool = rawPool ? normalizePool(rawPool, def.defiLlamaPoolId) : null;
    sources.push({
      provider: 'decentralized-llama',
      type: 'protocol-data',
      retrievedAt,
      sourceId: def.defiLlamaPoolId,
    });
  } catch (err) {
    logger.warn(`Yield fetch failed for ${def.slug}`, { message: err.message });
  }

  try {
    const ids = def.coingeckoIds || [];
    const rawPrices = await cachedOrFetch(
      `prices:${def.coingeckoIds.join(',')}`,
      () => fetchTokenPrices(ids, options),
      KINDS.market,
    );
    const prices = normalizePrices(rawPrices, ids);
    priceUsd = prices[ids[0]] ?? null;
    sources.push({
      provider: 'coingecko',
      type: 'market-data',
      retrievedAt,
      sourceId: ids.join(','),
    });
  } catch (err) {
    logger.warn(`Market fetch failed for ${def.slug}`, { message: err.message });
  }

  try {
    const rawInspection = await cachedOrFetch(
      `inspection:${def.chainId}:${def.contractAddress}`,
      () => inspectContracts(def, options),
      KINDS.onchain,
    );
    normalizedInspection = normalizeInspection(rawInspection);
    sources.push({
      provider: 'on-chain-inspection',
      type: 'blockchain-data',
      retrievedAt,
      sourceId: def.contractAddress,
    });
  } catch (err) {
    logger.warn(`On-chain inspection failed for ${def.slug}`, {
      message: err.message,
    });
  }

  const security = normalizedInspection
    ? await evaluateSecurity(def, normalizedInspection, options)
    : failedSecurity('On-chain inspection unavailable.');

  const deployed = normalizedInspection ? normalizedInspection.contractDeployed : null;
  const hasYield = pool !== null && pool.apy !== null;
  const hasTvl = pool !== null && pool.tvlUsd !== null;

  const eligibility = evaluateEligibility({
    contractDeployed: deployed,
    verificationStatus: security.verificationStatus,
    hasYield,
    hasTvl,
  });

  const confidence = computeDataConfidence({
    hasYield: hasYield || hasTvl,
    hasPrice: priceUsd !== null,
    hasOnchain: deployed !== null,
    securityStatus: security.verificationStatus,
  });

  return analyzeOpportunity({
    definition: def,
    pool,
    priceUsd,
    inspection: normalizedInspection,
    security,
    eligibility,
    confidence,
    sources,
    lastUpdated: retrievedAt,
  });
}

/**
 * Fetch + analyze all registered real opportunities.
 * Never throws for a single failure — each opportunity degrades to an
 * insufficient-data record so the pipeline stays up.
 */
export async function fetchAllOpportunityData(options) {
  const defs = await loadOpportunityDefinitions();
  const results = [];
  for (const def of defs) {
    try {
      results.push(await buildOpportunity(def, options));
    } catch (err) {
      logger.error(`Opportunity ingestion failed for ${def.slug}`, {
        message: err.message,
      });
      results.push({
        ...(await buildOpportunityStub(def)),
        eligibility: 'insufficient-data',
        eligibilityReason: `Ingestion error: ${err.message}`,
        dataConfidence: 'Low',
        dataSources: [],
        lastUpdated: new Date().toISOString(),
      });
    }
  }
  return results;
}

async function buildOpportunityStub(def) {
  const eligibility = evaluateEligibility({
    contractDeployed: null,
    verificationStatus: 'unavailable',
    hasYield: false,
    hasTvl: false,
  });
  return analyzeOpportunity({
    definition: def,
    pool: null,
    priceUsd: null,
    inspection: null,
    security: failedSecurity('Data pipeline failed for this opportunity.'),
    eligibility,
    confidence: { level: 'Low', basis: ['Ingestion failed — no real data available.'] },
    sources: [],
    lastUpdated: new Date().toISOString(),
  });
}

export { buildOpportunity };