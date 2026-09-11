// Phase 6: replay-protection lock.
//
// Layer 2 of idempotency (Phase 6 §8). Layer 1 is the deterministic
// idempotency key + database state machine (Phase 5); this lock prevents the
// same workflow being submitted concurrently from two requests, two browser
// tabs, or after a restart.
//
// Uses Redis SET NX EX when Redis is available. If it is not, the lock
// degrades to an in-process mutex (per-process). Redis down is NEVER treated
// as a security failure by itself — the durable compare-and-swap in the
// repository (tryMarkSubmitting) remains the authoritative guard.

import net from 'node:net';
import { getClient } from '../../backend/src/cache/redisClient.js';
import { config } from '../../backend/src/config/index.js';

const inProcessLocks = new Map();

// Redis enters an infinite background auto-reconnect loop when it is down;
// poking it from test/dev processes keeps them alive forever. We probe the
// TCP port ourselves (short timeout, cached) and only touch the redis client
// when it is actually reachable. When Redis is absent the lock degrades to
// the in-process mutex, which is safe: the durable repository CAS remains
// the authoritative replay-protection layer.
let redisProbedAt = 0;
let redisReachable = null;
const REDIS_PROBE_TTL_MS = 5000;

async function redisIsLikelyUp() {
  const now = Date.now();
  if (now - redisProbedAt < REDIS_PROBE_TTL_MS && redisReachable !== null) {
    return redisReachable;
  }
  redisProbedAt = now;
  try {
    const url = new URL(config.redisUrl || 'redis://127.0.0.1:6379');
    const port = Number(url.port) || 6379;
    const host = url.hostname || '127.0.0.1';
    redisReachable = await new Promise((resolve) => {
      const sock = net.connect({ host, port });
      sock.setTimeout(300);
      sock.once('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.once('timeout', () => {
        sock.destroy();
        resolve(false);
      });
      sock.once('error', () => resolve(false));
    });
  } catch {
    redisReachable = false;
  }
  return redisReachable;
}

/**
 * Acquire an exclusive execution lock for a workflow.
 * @param {string} workflowId
 * @param {number} [ttlMs]
 * @param {object} [deps] — injectable `{ getClient }` for tests
 * @returns {Promise<{ok: boolean, via: 'redis'|'process'|'none'}>}
 */
export async function acquireExecutionLock(workflowId, ttlMs = 90_000, deps = {}) {
  const key = `phase6:exec-lock:${workflowId}`;
  const getRedis = deps.getClient || getClient;

  let client = null;
  if (deps.getClient || (await redisIsLikelyUp())) {
    try {
      client = await getRedis();
    } catch {
      client = null;
    }
  }

  if (client) {
    try {
      const ok = await client.set(key, '1', { NX: true, EX: Math.ceil(ttlMs / 1000) });
      return { ok: ok === true || ok === 'OK', via: 'redis' };
    } catch {
      client = null;
    }
  }

  // Degraded path — per-process mutex.
  const now = Date.now();
  const held = inProcessLocks.get(workflowId);
  if (held && held.expiresAt > now) {
    return { ok: false, via: 'none' };
  }
  inProcessLocks.set(workflowId, { expiresAt: now + ttlMs });
  return { ok: true, via: 'process' };
}

/** Release an execution lock previously acquired by the calling process. */
export async function releaseExecutionLock(workflowId, deps = {}) {
  inProcessLocks.delete(workflowId);
  const getRedis = deps.getClient || getClient;
  let client = null;
  if (deps.getClient || (await redisIsLikelyUp())) {
    try {
      client = await getRedis();
    } catch {
      client = null;
    }
  }
  if (client) {
    try {
      await client.del(`phase6:exec-lock:${workflowId}`);
    } catch {
      /* best-effort */
    }
  }
}