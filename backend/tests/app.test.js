import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { checkDatabaseConnection, closeDatabase } from '../src/config/db.js';
import { closeCache } from '../src/cache/redisClient.js';

let server;
let baseUrl;
let dbAvailable = false;

before(async () => {
  try {
    await checkDatabaseConnection();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDatabase();
  await closeCache();
});

async function api(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function skipWithoutDb(t) {
  if (!dbAvailable) {
    t.skip('PostgreSQL is not running. Run: npm run db:setup');
    return true;
  }
  return false;
}

test('GET /api/health returns ok and dependency status', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(body.data.status, 'ok');
  assert.ok(body.data.infrastructure);
});

test('GET /api/opportunities lists the seeded opportunities', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/opportunities');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.data.items));
  assert.ok(body.data.count >= 3);
});

test('GET /api/opportunities exposes Phase 3 provenance fields', async (t) => {
  if (skipWithoutDb(t)) return;
  const { body } = await api('/api/opportunities');
  const first = body.data.items[0];
  assert.ok(first.contractAddress, 'contract address present');
  assert.ok(typeof first.tvlUsd === 'number' && first.tvlUsd > 0, 'real TVL present');
  assert.equal(first.apyType, 'APY');
  assert.ok(['eligible', 'insufficient-data'].includes(first.eligibility));
  assert.ok(['High', 'Medium', 'Low'].includes(first.dataConfidence));
  assert.ok(Array.isArray(first.dataSources) && first.dataSources.length > 0);
  assert.ok(Array.isArray(first.risks));
});

test('GET /api/opportunities supports filters', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/opportunities?risk=low&sort=score');
  assert.equal(status, 200);
  for (const item of body.data.items) {
    assert.equal(item.risk, 'low');
  }
});

test('GET /api/opportunities/:id returns a single opportunity', async (t) => {
  if (skipWithoutDb(t)) return;
  const { body: list } = await api('/api/opportunities');
  const first = list.data.items[0];
  const { status, body } = await api(`/api/opportunities/${first.id}`);
  assert.equal(status, 200);
  assert.equal(body.data.slug, first.slug);
  assert.ok(Array.isArray(body.data.risks));
});

test('GET /api/opportunities/:id accepts a slug', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/opportunities/ethereum-staking');
  assert.equal(status, 200);
  assert.equal(body.data.id, 1);
});

test('GET /api/opportunities/9999 returns 404', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status } = await api('/api/opportunities/9999');
  assert.equal(status, 404);
});

test('POST /api/rankings returns a deterministic personalized ranking', async (t) => {
  if (skipWithoutDb(t)) return;
  const payload = { allocation: 100, riskPreference: 'moderate' };
  const { status, body } = await api('/api/rankings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(status, 201);
  // At least the curated dataset is ranked; legit on-chain web-feed pools
  // (source=webfeed) may also be present below them.
  assert.ok(body.data.ranked.length >= 3, 'ranked list includes the curated rows');

  // The curated rows lead the list and carry live yield and TVL.
  const top = body.data.ranked.slice(0, 3);
  for (const r of top) {
    assert.ok(Number(r.apy) > 0, `${r.slug} has real APY`);
    assert.equal(typeof r.liquidityRating, 'string');
    assert.ok(r.whyGuardianLikes.toLowerCase().includes('real pool data'));
  }

  // Documented deterministic order for the eligible dataset.
  const order = top.map((r) => r.slug);
  assert.deepEqual(order, [
    'ethereum-staking',
    'stablecoin-lending',
    'liquidity-provision',
  ]);

  // Deterministic: repeating the request yields identical ranking output
  // (no refresh can fire between two immediate calls).
  const again = await api('/api/rankings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(again.status, 201);
  assert.deepEqual(
    again.body.data.ranked.map((r) => [r.slug, r.score]),
    body.data.ranked.map((r) => [r.slug, r.score]),
  );
});

test('POST /api/rankings rejects invalid input with 400', async () => {
  const { status, body } = await api('/api/rankings', {
    method: 'POST',
    body: JSON.stringify({ allocation: -5, riskPreference: 'yolo' }),
  });
  assert.equal(status, 400);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('POST /api/rankings returns no blocked items for the eligible dataset', async (t) => {
  if (skipWithoutDb(t)) return;
  const { body } = await api('/api/rankings', {
    method: 'POST',
    body: JSON.stringify({ allocation: 100, riskPreference: 'aggressive' }),
  });
  assert.ok(body.data.ranked.length > 0);
  for (const r of body.data.ranked) {
    assert.equal(r.blocked, false);
  }
});

test('POST /api/opportunities/refresh runs the live provider pipeline', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/opportunities/refresh', {
    method: 'POST',
  });
  assert.equal(status, 201);
  assert.equal(body.data.source, 'providers');
  assert.ok(body.data.refreshed >= 3);
  assert.ok(typeof body.data.completed === 'string');
});

test('GET /api/opportunities reflects refreshed freshness metadata', async (t) => {
  if (skipWithoutDb(t)) return;
  const { body } = await api('/api/opportunities');
  const first = body.data.items[0];
  assert.ok(typeof first.lastUpdated === 'string');
  assert.ok(Number.isFinite(first.freshnessMs));
});

test('GET /api/preferences returns stored preferences', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/preferences');
  assert.equal(status, 200);
  assert.ok(body.data.allocation > 0);
});

test('POST /api/preferences updates preferences', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/preferences', {
    method: 'POST',
    body: JSON.stringify({ allocation: 250, riskPreference: 'conservative' }),
  });
  assert.equal(status, 201);
  assert.equal(Number(body.data.allocation), 250);
  assert.equal(body.data.riskPreference, 'conservative');
});

test('GET /api/activities returns the activity feed', async (t) => {
  if (skipWithoutDb(t)) return;
  const { status, body } = await api('/api/activities');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.data.items));
});

test('unknown routes return 404', async () => {
  const { status } = await api('/api/definitely-not-real');
  assert.equal(status, 404);
});