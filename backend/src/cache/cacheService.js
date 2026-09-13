// Cache wrapper on top of Redis. Every operation fails soft: if Redis is
// unavailable a cache read is a miss and a write is skipped — callers fall
// through to PostgreSQL / providers. Redis is never the source of truth.
//
// Keys are version-prefixed so a controlled refresh invalidates all previous
// opportunity / provider entries without a slow full flush.

import { getClient, isCacheAvailable } from './redisClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const KINDS = {
  market: 'market',
  yields: 'yields',
  onchain: 'onchain',
  opportunity: 'opportunity',
  ranking: 'ranking',
};

const DEFAULT_TTL_BY_KIND = {
  market: 60,       // prices move fast
  yields: 300,      // pool APY/TVL refresh
  onchain: 3600,    // contract facts are static-ish
  opportunity: 120,
  ranking: 300,
};

function ttlFor(kind) {
  const configured = config.cacheTtl[kind];
  if (configured !== undefined && configured !== null) return configured;
  return DEFAULT_TTL_BY_KIND[kind] ?? DEFAULT_TTL_BY_KIND.opportunity;
}

let version = null;

async function currentVersion() {
  if (version !== null) return version;
  try {
    const client = await getClient();
    if (!client) return '0';
    const raw = await client.get('cacheVersion');
    version = raw || '0';
  } catch {
    version = '0';
  }
  return version;
}

// Only aggregate caches (opportunities + rankings) are versioned. Provider
// caches (market / yields / onchain) keep a stable key so a data refresh
// reuses them instead of re-calling external APIs and burning rate limits.
const VERSIONED_KINDS = new Set(['opportunity', 'ranking']);

/**
 * Build a versioned, kind-scoped cache key.
 */
export async function cacheKey(kind, raw) {
  if (!VERSIONED_KINDS.has(kind)) return `${kind}:${raw}`;
  const v = await currentVersion();
  return `${kind}:v${v}:${raw}`;
}

/**
 * Invalidate every previously cached entry by bumping the version.
 */
export async function bumpCacheVersion() {
  version = null;
  try {
    const client = await getClient();
    if (!client) return;
    await client.incr('cacheVersion');
  } catch (err) {
    logger.warn('Cache version bump failed', { message: err.message });
  }
}

export async function get(rawKey, kind = 'opportunity') {
  const key = await cacheKey(kind, rawKey);
  try {
    if (!(await isCacheAvailable())) return null;
    const client = await getClient();
    if (!client) return null;
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn('Cache read failed', { key, message: err.message });
    return null;
  }
}

export async function set(rawKey, value, kind = 'opportunity') {
  const key = await cacheKey(kind, rawKey);
  try {
    if (!(await isCacheAvailable())) return;
    const client = await getClient();
    if (!client) return;
    await client.set(key, JSON.stringify(value), { EX: ttlFor(kind) });
  } catch (err) {
    logger.warn('Cache write failed', { key, message: err.message });
  }
}

export async function del(rawKey, kind = 'opportunity') {
  const key = await cacheKey(kind, rawKey);
  try {
    if (!(await isCacheAvailable())) return;
    const client = await getClient();
    if (!client) return;
    await client.del(key);
  } catch (err) {
    logger.warn('Cache delete failed', { key, message: err.message });
  }
}

export function keyForOpportunities(filters) {
  return JSON.stringify(filters);
}

export function keyForOpportunity(id) {
  return `opportunity:${id}`;
}

export function keyForRanking(payload) {
  return `ranking:${payload.allocation}:${payload.riskPreference}`;
}

export { KINDS };