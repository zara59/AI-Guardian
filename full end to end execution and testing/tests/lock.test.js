import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireExecutionLock,
  releaseExecutionLock,
} from '../backend/lock.js';

// Redis is intentionally absent in tests: we exercise the in-process mutex
// path (the durable CAS in the repository remains the authoritative guard).
const NO_REDIS = { getClient: async () => null };

test('lock is exclusive per workflow', async () => {
  const first = await acquireExecutionLock('wf-lock-a', 90_000, NO_REDIS);
  assert.equal(first.ok, true);
  const second = await acquireExecutionLock('wf-lock-a', 90_000, NO_REDIS);
  assert.equal(second.ok, false, 'second concurrent acquire must fail');
  await releaseExecutionLock('wf-lock-a', NO_REDIS);
  const third = await acquireExecutionLock('wf-lock-a', 90_000, NO_REDIS);
  assert.equal(third.ok, true, 'released lock must be acquirable again');
  await releaseExecutionLock('wf-lock-a', NO_REDIS);
});

test('lock is scoped per workflow (no cross blocking)', async () => {
  const a = await acquireExecutionLock('wf-b', 90_000, NO_REDIS);
  const b = await acquireExecutionLock('wf-c', 90_000, NO_REDIS);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  await releaseExecutionLock('wf-b', NO_REDIS);
  await releaseExecutionLock('wf-c', NO_REDIS);
});