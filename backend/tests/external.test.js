import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePool,
  normalizePrices,
  normalizeInspection,
  validateOpportunityDefinition,
  requireValidAddress,
} from '../src/external/normalizers.js';
import { computeDataConfidence, evaluateEligibility } from '../src/external/dataQuality.js';
import { analyzeOpportunity } from '../src/external/analysis.js';

const DEF = {
  slug: 'test-opp',
  name: 'Test Opportunity',
  protocol: 'Test Protocol',
  category: 'defi',
  network: 'ethereum',
  chainId: 1,
  asset: 'TEST',
  contractAddress: '0x0000000000000000000000000000000000000001',
  assetAddress: '0x0000000000000000000000000000000000000002',
  description: 'desc',
  standing: 'major-established',
  defiLlamaProject: 'test',
  defiLlamaPoolId: 'pool-1',
  coingeckoIds: ['test-token'],
  minimumRecommendedUsd: 100,
  expectedInteraction: 'Provide liquidity',
  exitConditions: 'Withdraw anytime',
  risks: [],
};

test('normalizePrices accepts raw and flattened shapes', () => {
  const raw = normalizePrices({ ethereum: { usd: 2517 } }, ['ethereum']);
  assert.equal(raw.ethereum, 2517);
  const flat = normalizePrices({ ethereum: 2517 }, ['ethereum']);
  assert.equal(flat.ethereum, 2517);
  const bad = normalizePrices({ ethereum: { usd: 'not-a-number' } }, ['ethereum']);
  assert.equal(bad.ethereum, undefined);
});

test('normalizePool rejects malformed provider records', () => {
  assert.throws(() => normalizePool(null, 'x'));
  // A pool missing a symbol is unusable.
  assert.throws(() => normalizePool({ apy: 1, tvlUsd: 1 }, 'x'));
  assert.throws(() => normalizePool({ id: 'other', symbol: 'ABC', apy: 1, tvlUsd: 1 }, 'x'));
  const partial = normalizePool({ symbol: 'ABC' }, 'x');
  assert.equal(partial.apy, null); // null yield is honest, never invented
  const ok = normalizePool(
    { id: 'p', symbol: 'STETH', chain: 'Ethereum', apy: 2.2, apyBase: 2.2, tvlUsd: 1e9, rewardTokens: [] },
    'p',
  );
  assert.equal(ok.apy, 2.2);
});

test('normalizeInspection flags a missing contract', () => {
  const missing = normalizeInspection({
    network: 'ethereum',
    chainId: 1,
    contract: { deployed: false, bytecodeLength: 0 },
  });
  assert.equal(missing.contractDeployed, false);
  assert.equal(missing.rejection, 'contract-not-deployed');
  const deployed = normalizeInspection({
    network: 'ethereum',
    chainId: 1,
    contract: { deployed: true, bytecodeLength: 2400 },
    tokenDecimals: 6,
  });
  assert.equal(deployed.contractDeployed, true);
  assert.equal(deployed.tokenDecimals, 6);
});

test('validateOpportunityDefinition rejects registry drift', () => {
  assert.throws(() => validateOpportunityDefinition({ ...DEF, contractAddress: 'not-an-address' }));
  assert.throws(() => validateOpportunityDefinition({ ...DEF, chainId: 0 }));
  assert.throws(() => validateOpportunityDefinition({ ...DEF, slug: undefined }));
  const ok = validateOpportunityDefinition(DEF);
  assert.equal(ok.slug, DEF.slug);
});

test('requireValidAddress normalizes to lowercase', () => {
  assert.equal(
    requireValidAddress('0x0000000000000000000000000000000000000001', 'x'),
    '0x0000000000000000000000000000000000000001',
  );
});

test('confidence is capped at Medium when verification is incomplete', () => {
  const high = computeDataConfidence({
    hasYield: true,
    hasPrice: true,
    hasOnchain: true,
    securityStatus: 'verification-incomplete',
  });
  assert.equal(high.level, 'Medium');
  assert.ok(high.basis.some((b) => b.includes('verification')));
  const complete = computeDataConfidence({
    hasYield: true,
    hasPrice: true,
    hasOnchain: true,
    securityStatus: 'verification-complete',
  });
  assert.equal(complete.level, 'High');
});

test('eligibility blocks a contract that is not deployed', () => {
  const r = evaluateEligibility({
    contractDeployed: false,
    verificationStatus: 'unavailable',
    hasYield: true,
    hasTvl: true,
  });
  assert.equal(r.eligibility, 'avoid');
  assert.deepEqual(r.hardFlags, ['contract-not-deployed']);
});

test('eligibility degrades to insufficient-data without key signals', () => {
  const r = evaluateEligibility({
    contractDeployed: null,
    verificationStatus: 'unavailable',
    hasYield: false,
    hasTvl: false,
  });
  assert.equal(r.eligibility, 'insufficient-data');
});

test('analysis rubric is deterministic and never fabricates yield', () => {
  const base = {
    definition: DEF,
    pool: { id: 'pool-1', symbol: 'TEST', chain: 'Ethereum', apy: 12.5, apyBase: 12.5, tvlUsd: 50_000_000, rewardTokens: [] },
    priceUsd: 1.2,
    inspection: { network: 'ethereum', chainId: 1, contractDeployed: true, contractCodeLength: 1000, tokenDecimals: 18 },
    security: {
      provider: 'on-chain-inspection',
      verificationStatus: 'verification-incomplete',
      contractDeployed: true,
      contractCodeLength: 1000,
      tokenDecimals: 18,
      upgradeability: 'unknown',
      ownership: 'unknown',
      pauseControl: 'unknown',
      notes: ['deployed'],
    },
    eligibility: { eligibility: 'eligible', reason: 'ok', hardFlags: [] },
    confidence: { level: 'Medium', basis: [] },
    sources: [{ provider: 'coingecko', type: 'market-data', retrievedAt: 'x', sourceId: 'y' }],
    lastUpdated: '2026-09-09T00:00:00.000Z',
  };

  const a = analyzeOpportunity(base);
  const b = analyzeOpportunity(base);
  assert.deepEqual(a.metrics, b.metrics, 'same inputs -> same metrics');
  assert.equal(a.metrics.currentYield, 8, '>=10% apy maps to max yield score');
  assert.ok(a.metrics.opportunitySize <= 4, 'opportunity size never exceeds its slot max');

  const noYield = analyzeOpportunity({ ...base, pool: null, priceUsd: null, inspection: null });
  assert.equal(noYield.metrics.currentYield, 0, 'no yield -> zero, never invented');
  assert.equal(noYield.metrics.marketConditions, 1, 'no price -> low but non-fatal');
  assert.equal(noYield.dataConfidence, 'Medium', 'confidence passed through from caller');
  assert.equal(noYield.securityStatus, base.security.verificationStatus);
});