import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankOpportunities } from '../src/ranking/ranker.js';
import { scoreLabel } from '../src/ranking/scores.js';
import { SEED_OPPORTUNITIES } from '../src/models/seedData.js';

// Build engine-ready opportunity records (as the repository returns them).
function toEngineRecord(seed, id) {
  const { metrics, ...rest } = seed;
  return {
    id,
    ...rest,
    risk: seed.risk,
    minimumAllocation: seed.minimumAllocation,
    ...metrics,
  };
}

const OPPORTUNITIES = SEED_OPPORTUNITIES.map((seed, i) =>
  toEngineRecord(seed, i + 1),
);

function rankFor(allocation, riskPreference) {
  return rankOpportunities(OPPORTUNITIES, { allocation, riskPreference });
}

function blockedCopy(seed, extra = {}) {
  return {
    ...toEngineRecord(seed, 99),
    slug: 'hot-25-farm',
    name: 'Hot 25% Farm',
    ...extra,
  };
}

test('moderate/100 produces the documented order and totals', () => {
  const { ranked } = rankFor(100, 'moderate');
  const bySlug = Object.fromEntries(ranked.map((r) => [r.slug, r]));

  const expectations = [
    ['ethereum-staking', 83, 'Strong Candidate'],
    ['stablecoin-lending', 81, 'Strong Candidate'],
    ['liquidity-provision', 80, 'Strong Candidate'],
  ];

  assert.equal(ranked.length, 3);
  expectations.forEach(([slug, score, label], index) => {
    const r = bySlug[slug];
    assert.equal(r.rank, index + 1, `${slug} rank`);
    assert.equal(r.score, score, `${slug} score`);
    assert.equal(r.scoreLabel, label, `${slug} label`);
  });
});

test('scores never exceed 100 and the breakdown sums to the score', () => {
  const { ranked } = rankFor(100, 'moderate');
  for (const r of ranked) {
    assert.ok(r.score >= 0 && r.score <= r.scoreMax, `${r.slug} bounded`);
    assert.equal(r.scoreMax, 100);
    assert.equal(r.blocked, false, `${r.slug} not blocked`);
    const breakdownTotal =
      r.breakdown.security.value +
      r.breakdown.potential.value +
      r.breakdown.sustainability.value +
      r.breakdown.liquidity.value +
      r.breakdown.userFit.value;
    assert.equal(breakdownTotal, r.score, `${r.slug} breakdown sums to score`);
  }
});

test('blocked opportunities are capped into the Avoid band', () => {
  const risky = blockedCopy(OPPORTUNITIES[0], {
    hardFlags: ['critical-exploit-possible', 'suspicious-permissions'],
  });
  const { ranked } = rankOpportunities([...OPPORTUNITIES, risky], {
    allocation: 100,
    riskPreference: 'aggressive',
  });
  const entry = ranked.find((r) => r.slug === risky.slug);
  assert.equal(entry.blocked, true);
  assert.ok(entry.blockReason);
  assert.ok(entry.score <= 24);
  assert.equal(entry.scoreLabel, 'Avoid');
});

test('hard flags force blocking regardless of high potential', () => {
  const hot = blockedCopy(OPPORTUNITIES[2], {
    currentYield: 8,
    incentives: 5,
    hardFlags: ['critical-exploit-possible', 'suspicious-permissions'],
  });
  const { ranked } = rankOpportunities([...OPPORTUNITIES, hot], {
    allocation: 100,
    riskPreference: 'aggressive',
  });
  const entry = ranked.find((r) => r.slug === hot.slug);
  assert.equal(entry.blocked, true);
  assert.ok(entry.score <= 24, 'still capped to Avoid');
  assert.ok(entry.rank >= 4, 'never ranks above cleaner opportunities');
});

test('deterministic: same input yields identical output on re-run', () => {
  const a = rankFor(100, 'moderate');
  const b = rankFor(100, 'moderate');
  assert.deepEqual(
    a.ranked.map((r) => [r.slug, r.score]),
    b.ranked.map((r) => [r.slug, r.score]),
  );
});

test('personalization: risk preference changes user-fit sub-scores', () => {
  const conservative = rankFor(100, 'conservative');
  const aggressive = rankFor(100, 'aggressive');

  const consEthereum = conservative.ranked.find((r) => r.slug === 'ethereum-staking');
  const aggEthereum = aggressive.ranked.find((r) => r.slug === 'ethereum-staking');

  // low risk fits a conservative user best (5) and an aggressive user less (2).
  assert.equal(consEthereum.details.userFit.find((p) => p.label === 'riskPreferenceFit').value, 5);
  assert.equal(aggEthereum.details.userFit.find((p) => p.label === 'riskPreferenceFit').value, 2);
});

test('personalization: small allocations reduce capital-fit only where needed', () => {
  const smaller = rankFor(20, 'moderate');
  const entry = smaller.ranked.find((r) => r.slug === 'liquidity-provision');
  // minimumAllocation 100 with a $20 budget -> capital fit 5 * 20/100 = 1
  assert.equal(
    entry.details.userFit.find((p) => p.label === 'minimumCapital').value,
    1,
  );
});

test('scoreLabel boundaries are correct', () => {
  assert.equal(scoreLabel(100), 'Strong Candidate');
  assert.equal(scoreLabel(80), 'Strong Candidate');
  assert.equal(scoreLabel(79), 'Worth Considering');
  assert.equal(scoreLabel(65), 'Worth Considering');
  assert.equal(scoreLabel(64), 'High Caution');
  assert.equal(scoreLabel(45), 'High Caution');
  assert.equal(scoreLabel(44), 'Avoid');
  assert.equal(scoreLabel(0), 'Avoid');
});