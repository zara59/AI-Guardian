import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReadiness } from '../backend/readiness.js';

const A = '0x' + 'a'.repeat(40);

function okDeploy() {
  return { chainId: 11155111, deployed: true, reason: 'VERIFIED', faults: [], artifact: { vault: A }, onChain: {} };
}

function deps(overrides = {}) {
  return {
    getPhase6Config: () => ({
      executionRequired: true,
      effectiveMode: 'keeperhub',
      preflightFunding: true,
      minGasWei: '10000000000000000',
    }),
    verifySepoliaDeployment: async () => okDeploy(),
    probeKeeperHubAuth: async () => ({ configured: true, authenticated: true }),
    checkExecutionFunding: async () => ({ state: 'ready', ready: true, detail: 'Execution wallet funded.', evidence: {} }),
    ...overrides,
  };
}

test('fully ready → ready true, no blockers', async () => {
  const r = await checkReadiness(deps());
  assert.equal(r.ready, true);
  assert.deepEqual(r.blockers, []);
});

test('deployment missing → not ready with real reason', async () => {
  const r = await checkReadiness(deps({
    verifySepoliaDeployment: async () => ({ chainId: 11155111, deployed: false, reason: 'NOT_DEPLOYED', detail: 'nothing at config/contracts/11155111.json', artifact: null }),
  }));
  assert.equal(r.ready, false);
  assert.ok(r.blockers.some((b) => /null/.test(b) || /11155111/.test(b)));
  assert.equal(r.funding.state, 'skipped');
});

test('policy blocked (required but key absent) short-circuits with the honest blocker', async () => {
  const r = await checkReadiness({
    ...deps({
      getPhase6Config: () => ({
        executionRequired: true,
        effectiveMode: 'blocked',
        preflightFunding: true,
        minGasWei: '10000000000000000',
      }),
      probeKeeperHubAuth: async () => ({ configured: false, authenticated: false, error: 'kh_ key absent' }),
    }),
  });
  assert.equal(r.ready, false);
  assert.ok(r.blockers.some((b) => /KEEPERHUB_EXECUTION_REQUIRED/.test(b)));
  assert.equal(r.policy.noSilentFallback, true);
});

test('unauthenticated keeperhub → not ready', async () => {
  const r = await checkReadiness(deps({
    probeKeeperHubAuth: async () => ({ configured: true, authenticated: false, error: 'authentication failed' }),
  }));
  assert.equal(r.ready, false);
});

test('unfunded wallet → not ready, exact reason surfaced', async () => {
  const r = await checkReadiness(deps({
    checkExecutionFunding: async () => ({ state: 'insufficient_gas', ready: false, detail: 'execution wallet needs ≥ 0.01 ETH', evidence: {} }),
  }));
  assert.equal(r.ready, false);
  assert.ok(r.blockers.includes('execution wallet needs ≥ 0.01 ETH'));
});