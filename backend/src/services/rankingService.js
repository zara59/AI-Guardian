import * as opportunityRepository from '../repositories/opportunityRepository.js';
import * as rankingRepository from '../repositories/rankingRepository.js';
import * as activityRepository from '../repositories/activityRepository.js';
import { getUserRepositoryContext } from './userHelper.js';
import { ensureFresh, freshnessOf } from './refreshService.js';
import { rankOpportunities } from '../ranking/ranker.js';
import { get, set, keyForRanking } from '../cache/cacheService.js';
import { config } from '../config/index.js';

/**
 * Run the deterministic ranking for a user's allocation and risk preference.
 * Results are cached (Redis) and persisted (PostgreSQL). Before ranking we
 * check freshness so rankings reflect the latest real provider data.
 */
export async function createRanking({ allocation, riskPreference }) {
  const user = await getUserRepositoryContext();
  const cacheKey = keyForRanking({ allocation, riskPreference });

  const cached = await get(cacheKey, 'ranking');
  if (cached) {
    return { ...cached, meta: { ...cached.meta, cache: 'hit' } };
  }

  await ensureFresh();

  const opportunities = (await opportunityRepository.findAll({})).map((row) => ({
    ...row,
    freshnessMs: freshnessOf(row),
  }));
  if (!opportunities.length) {
    return {
      ranked: [],
      meta: {
        requestedWith: { allocation, riskPreference },
        message: 'No opportunities are currently available for ranking.',
      },
    };
  }

  const result = rankOpportunities(opportunities, { allocation, riskPreference });

  // Persist the ranking result.
  await rankingRepository.save(result, {
    userId: user.id,
    allocation,
    riskPreference,
  });

  // Record activity.
  await activityRepository.insert({
    userId: user.id,
    type: 'ranking',
    title: 'Personalized ranking generated',
    description: `Opportunities ranked for a $${allocation} allocation with ${riskPreference} risk preference.`,
    metadata: { allocation, riskPreference },
  });

  await set(cacheKey, result, 'ranking');
  return { ...result, meta: { ...result.meta, cache: 'miss' } };
}

export function getCacheTtl() {
  return config.cacheTtl.ranking;
}