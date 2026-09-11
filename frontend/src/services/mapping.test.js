import { describe, it, expect } from 'vitest';
import {
  categoryLabel,
  riskLabel,
  formatApy,
  formatTvl,
  apyTypeLabel,
  confidenceLabel,
  confidenceTone,
  formatMinimumAllocation,
  mapRankedItem,
  mapRankedResult,
  relativeTime,
  activityStatus,
  mapActivity,
  moduleStatus,
  mapGuardianStatus,
  mapWebCandidate,
  mapDiscovery,
} from './mapping';

const SAMPLE_RANKED_ENTRY = {
  rank: 1,
  id: 1,
  slug: 'ethereum-staking',
  name: 'Ethereum Staking',
  category: 'staking',
  chain: 'Ethereum',
  protocol: 'Lido',
  asset: 'stETH',
  risk: 'low',
  apy: 4.2,
  apyType: 'organic',
  tvlUsd: 24303516726,
  dataConfidence: 'medium',
  eligibility: 'eligible',
  securityStatus: 'verification-incomplete',
  dataSources: [
    { provider: 'DefiLlama', type: 'yields' },
    { provider: 'CoinGecko', type: 'prices' },
    { provider: 'Ethereum RPC', type: 'onchain' },
  ],
  lastUpdated: new Date().toISOString(),
  liquidityRating: 'Very High',
  minimumAllocation: 10,
  description: 'Stake ETH.',
  whyGuardianLikes: 'Strong maturity.',
  risks: [{ title: 'Smart-contract risk', description: 'Low.' }],
  blocked: false,
  blockReason: null,
  score: 91,
  rawScore: 91,
  scoreLabel: 'Strong Candidate',
  expectedInteraction: 'Stake assets',
  breakdown: {
    security: { value: 30, max: 35 },
    potential: { value: 22, max: 25 },
    sustainability: { value: 15, max: 15 },
    liquidity: { value: 9, max: 10 },
    userFit: { value: 15, max: 15 },
  },
};

describe('categoryLabel', () => {
  it('maps known slugs to display labels', () => {
    expect(categoryLabel('staking')).toBe('Staking');
    expect(categoryLabel('lending')).toBe('Lending');
    expect(categoryLabel('defi')).toBe('DeFi');
    expect(categoryLabel('incentive')).toBe('Incentive');
    expect(categoryLabel('experimental')).toBe('Experimental');
  });
  it('capitalizes unknown categories', () => {
    expect(categoryLabel('gaming')).toBe('Gaming');
  });
});

describe('riskLabel', () => {
  it('maps backend risk to capitalized labels', () => {
    expect(riskLabel('low')).toBe('Low');
    expect(riskLabel('medium')).toBe('Medium');
    expect(riskLabel('high')).toBe('High');
  });
});

describe('formatApy', () => {
  it('formats numeric apy with a percent sign', () => {
    expect(formatApy(4.2)).toBe('4.2%');
    expect(formatApy(12)).toBe('12%');
  });
  it('handles missing values', () => {
    expect(formatApy(null)).toBe('—');
  });
});

describe('formatTvl', () => {
  it('formats large TVL in B/M/K units', () => {
    expect(formatTvl(24303516726)).toBe('$24.30B');
    expect(formatTvl(139090368)).toBe('$139.1M');
    expect(formatTvl(5000)).toBe('$5.0K');
  });
  it('handles missing or invalid values', () => {
    expect(formatTvl(null)).toBe(null);
    expect(formatTvl(-1)).toBe(null);
    expect(formatTvl('nope')).toBe(null);
  });
});

describe('apyTypeLabel / confidenceLabel / confidenceTone', () => {
  it('maps known types and falls back gracefully', () => {
    expect(apyTypeLabel('organic')).toBe('organic');
    expect(apyTypeLabel(undefined)).toBe('yield');
    expect(confidenceLabel('high')).toBe('High');
    expect(confidenceLabel(undefined)).toBe('Unknown');
    expect(confidenceTone('high')).toBe('green');
    expect(confidenceTone('medium')).toBe('amber');
    expect(confidenceTone('low')).toBe('orange');
  });
});

describe('formatMinimumAllocation', () => {
  it('formats dollar amounts', () => {
    expect(formatMinimumAllocation(10)).toBe('$10');
    expect(formatMinimumAllocation(1500)).toBe('$1,500');
  });
});

describe('mapRankedItem', () => {
  it('adapts backend entries to the UI card shape', () => {
    const card = mapRankedItem(SAMPLE_RANKED_ENTRY);
    expect(card.rank).toBe(1);
    expect(card.category).toBe('Staking');
    expect(card.risk).toBe('Low');
    expect(card.protocol).toBe('Lido');
    expect(card.asset).toBe('stETH');
    expect(card.apy).toBe('4.2%');
    expect(card.apyType).toBe('organic');
    expect(card.tvl).toBe('$24.30B');
    expect(card.confidence).toBe('Medium');
    expect(card.liquidity).toBe('Very High');
    expect(card.minimumAllocation).toBe('$10');
    expect(card.whyGuardianLikesIt).toBe('Strong maturity.');
    expect(card.breakdown.security).toBe(30);
    expect(card.maxBreakdown.security).toBe(35);
    expect(card.blocked).toBe(false);
    expect(card.risks).toHaveLength(1);
    expect(card.dataSources).toHaveLength(3);
  });

  it('propagates the block reason for flagged opportunities', () => {
    const entry = { ...SAMPLE_RANKED_ENTRY, blocked: true, blockReason: 'Rug-pull.' };
    expect(mapRankedItem(entry).blockReason).toBe('Rug-pull.');
  });
});

describe('mapRankedResult', () => {
  it('maps every ranked entry and keeps meta', () => {
    const result = mapRankedResult({
      ranked: [SAMPLE_RANKED_ENTRY],
      meta: { computedAt: '2026-01-01' },
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta.computedAt).toBe('2026-01-01');
    expect(result.updatedAt).toBe('2026-01-01');
  });
});

describe('relativeTime', () => {
  it('falls back gracefully', () => {
    expect(relativeTime(null)).toBe('just now');
    expect(relativeTime('not-a-date')).toBe('just now');
  });
  it('formats minutes and hours', () => {
    expect(relativeTime(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 minutes ago');
    expect(relativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())).toBe('2 hours ago');
  });
});

describe('activityStatus / mapActivity', () => {
  it('maps backend types to badge statuses', () => {
    expect(activityStatus('ranking')).toBe('completed');
    expect(activityStatus('review')).toBe('approved');
    expect(activityStatus('alert')).toBe('pending');
    expect(activityStatus('analyzed')).toBe('analyzed');
  });
  it('adapts activity rows', () => {
    const item = mapActivity({
      id: 3,
      type: 'review',
      title: 'Reviewed',
      description: 'You reviewed an opportunity',
      createdAt: new Date().toISOString(),
    });
    expect(item.status).toBe('approved');
    expect(item.title).toBe('Reviewed');
    expect(item.timestamp).toBe('just now');
  });
});

describe('moduleStatus / mapGuardianStatus', () => {
  it('maps backend statuses onto badge vocabulary', () => {
    expect(moduleStatus('ready')).toBe('completed');
    expect(moduleStatus('not-connected')).toBe('pending');
  });
  it('adapts guardian status payloads', () => {
    const mapped = mapGuardianStatus({
      protection: 'active',
      warning: 'n/a',
      infrastructure: { database: 'available', cache: 'available' },
      modules: [{ id: 'wallet-monitoring', name: 'Wallet Monitoring', status: 'ready', description: 'Watch.' }],
    });
    expect(mapped.protection).toBe('active');
    expect(mapped.modules[0].status).toBe('completed');
  });
});

describe('mapWebCandidate / mapDiscovery', () => {
  it('adapts screening-queue rows with checks and reasons', () => {
    const mapped = mapWebCandidate({
      candidateKey: '1:v2:0xpool',
      chainId: 1,
      kind: 'v3',
      pool: '0xpool',
      tokenA: '0xaaa',
      tokenB: '0xbbb',
      fee: 3000,
      blockNo: 25940000,
      screening: {
        status: 'flagged',
        reasons: ['tokenB decimals out of range (2)'],
        checks: {
          a: { deployed: true, decimals: 18, symbol: 'DAI' },
          b: { deployed: true, decimals: 2, symbol: 'SCAM' },
        },
      },
      guardianLinked: false,
      linkedSlug: null,
    });
    expect(mapped.status).toBe('flagged');
    expect(mapped.kind).toBe('v3');
    expect(mapped.symA).toBe('DAI');
    expect(mapped.symB).toBe('SCAM');
    expect(mapped.decimalsB).toBe(2);
    expect(mapped.reason).toContain('tokenB decimals');
    expect(mapped.guardianLinked).toBe(false);
    expect(mapped.postedSlug).toBe(null);
  });

  it('adapts a posted legit candidate with liquidity evidence', () => {
    const mapped = mapWebCandidate({
      candidateKey: '1:v2:0xpool',
      chainId: 1,
      kind: 'v2',
      pool: '0xpool',
      screening: {
        status: 'screened',
        reasons: [],
        checks: {
          a: { deployed: true, decimals: 18, symbol: 'DAI' },
          b: { deployed: true, decimals: 6, symbol: 'USDC' },
        },
        liquidity: { kind: 'v2', hasLiquidity: true },
      },
      postedSlug: 'webfeed:1:v2:0xpool',
      postedAt: '2026-01-01T00:00:00Z',
    });
    expect(mapped.status).toBe('screened');
    expect(mapped.postedSlug).toBe('webfeed:1:v2:0xpool');
    expect(mapped.hasLiquidity).toBe(true);
  });

  it('treats a missing screening block as pending', () => {
    const mapped = mapWebCandidate({ candidateKey: 'k', screening: null });
    expect(mapped.status).toBe('pending');
    expect(mapped.postedSlug).toBe(null);
  });

  it('adapts the full discovery payload including the posted count', () => {
    const mapped = mapDiscovery({
      chains: [{ chainId: 1, lastBlock: 25946768, updatedAt: '2026-01-01' }],
      webfeed: {
        summary: [{ chainId: 1, candidates: 200, screened: 200, flagged: 0, guardianLinked: 0, posted: 5 }],
        candidates: [
          { candidateKey: 'k', chainId: 1, blockNo: 1, screening: { status: 'screened', checks: {} } },
        ],
      },
    });
    expect(mapped.chains[0].lastBlock).toBe(25946768);
    expect(mapped.webfeed.summary[0].screened).toBe(200);
    expect(mapped.webfeed.summary[0].posted).toBe(5);
    expect(mapped.webfeed.candidates[0].status).toBe('screened');
  });
});