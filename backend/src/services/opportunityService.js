import * as opportunityRepository from '../repositories/opportunityRepository.js';
import { get, set, keyForOpportunities, keyForOpportunity, bumpCacheVersion } from '../cache/cacheService.js';
import { ensureFresh, freshnessOf } from './refreshService.js';
import { ApiError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

function attachFreshness(rows) {
  return rows.map((row) => ({ ...row, freshnessMs: freshnessOf(row) }));
}

/**
 * List opportunities, keeping the persisted data fresh. Provider failures
 * degrade to the last persisted snapshot — the list itself never 500s.
 */
export async function listOpportunities(filters) {
  const cacheKey = keyForOpportunities(filters);
  const cached = await get(cacheKey);
  if (cached) return cached;

  await ensureFresh();

  const rows = await opportunityRepository.findAll(filters);
  const result = { items: attachFreshness(rows), count: rows.length };

  await set(cacheKey, result);
  return result;
}

export async function getOpportunityById(id) {
  const cacheKey = keyForOpportunity(id);
  const cached = await get(cacheKey);
  if (cached) return cached;

  const row = await opportunityRepository.findById(id);
  if (!row) {
    throw new ApiError(404, 'Opportunity not found', 'OPPORTUNITY_NOT_FOUND');
  }

  await set(cacheKey, row);
  return { ...row, freshnessMs: freshnessOf(row) };
}

export async function invalidateOpportunityCache() {
  try {
    // Phase 3: version bump invalidates opportunity + provider entries at once.
    await bumpCacheVersion();
  } catch (err) {
    logger.warn('Cache invalidation skipped', { message: err.message });
  }
}