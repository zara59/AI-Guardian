import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { createRanking } = vi.hoisted(() => ({ createRanking: vi.fn() }));

vi.mock('../services/api', () => ({
  default: {
    createRanking,
    getOpportunities: vi.fn(),
    getActivities: vi.fn(),
    getGuardianStatus: vi.fn(),
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}));

import { useOpportunities } from './useOpportunities';

const RANKED_RESULT = {
  ranked: [
    {
      rank: 1,
      id: 1,
      slug: 'ethereum-staking',
      name: 'Ethereum Staking',
      category: 'staking',
      chain: 'Ethereum',
      risk: 'low',
      apy: 4.2,
      liquidityRating: 'Very High',
      minimumAllocation: 10,
      description: 'Stake ETH.',
      whyGuardianLikes: 'Strong.',
      risks: [],
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
    },
    {
      rank: 2,
      id: 3,
      slug: 'liquidity-provision',
      name: 'Liquidity Provision',
      category: 'defi',
      chain: 'Ethereum',
      risk: 'medium',
      apy: 12.5,
      liquidityRating: 'Medium',
      minimumAllocation: 100,
      description: 'Provide liquidity.',
      whyGuardianLikes: 'Fees.',
      risks: [],
      blocked: false,
      blockReason: null,
      score: 73,
      rawScore: 73,
      scoreLabel: 'Worth Considering',
      expectedInteraction: 'Provide token pair',
      breakdown: {
        security: { value: 22, max: 35 },
        potential: { value: 20, max: 25 },
        sustainability: { value: 11, max: 15 },
        liquidity: { value: 7, max: 10 },
        userFit: { value: 13, max: 15 },
      },
    },
  ],
  meta: { rankingMethod: 'deterministic' },
};

describe('useOpportunities', () => {
  beforeEach(() => {
    createRanking.mockReset();
    createRanking.mockResolvedValue(RANKED_RESULT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests a personalized ranking from the backend', async () => {
    const { result } = renderHook(() =>
      useOpportunities({ amount: 100, riskPreference: 'moderate' }),
    );

    await waitFor(() => {
      expect(result.current.opportunities.length).toBe(2);
    });

    expect(createRanking).toHaveBeenCalledWith({
      allocation: 100,
      riskPreference: 'moderate',
    });
  });

  it('adapts ranked entries into UI card shape with real scores', async () => {
    const { result } = renderHook(() => useOpportunities());

    await waitFor(() => {
      expect(result.current.opportunities.length).toBe(2);
    });

    const first = result.current.opportunities.find((o) => o.slug === 'ethereum-staking');
    expect(first.score).toBe(91);
    expect(first.category).toBe('Staking');
    expect(first.apy).toBe('4.2%');
    expect(first.minimumAllocation).toBe('$10');

    const stats = result.current.stats;
    expect(stats.total).toBe(2);
    expect(stats.highConfidence).toBe(1);
  });

  it('filters by risk client-side without re-fetching', async () => {
    const { result } = renderHook(() => useOpportunities());

    await waitFor(() => {
      expect(result.current.opportunities.length).toBe(2);
    });

    await act(async () => {
      result.current.setFilter('low');
    });
    expect(result.current.opportunities.length).toBe(1);
    expect(result.current.opportunities[0].slug).toBe('ethereum-staking');
    expect(createRanking).toHaveBeenCalledTimes(1);
  });

  it('surfaces backend failures as an error instead of falling back to mock data', async () => {
    createRanking.mockRejectedValue(new Error('Backend unreachable'));

    const { result } = renderHook(() => useOpportunities());

    await waitFor(() => {
      expect(result.current.error).toBe('Backend unreachable');
    });
    expect(result.current.opportunities).toHaveLength(0);
    expect(result.current.allOpportunities).toHaveLength(0);
  });
});