import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OpportunityCard from './OpportunityCard';

const BASE = {
  id: 5,
  slug: 'new-protocol-opportunity',
  rank: 5,
  name: 'New Protocol Opportunity',
  category: 'Experimental',
  score: 24,
  risk: 'High',
  apy: '25.0%',
  liquidity: 'Very Low',
  minimumAllocation: '$200',
  description: 'An unaudited yield farm.',
  whyGuardianLikesIt: 'High potential but very risky.',
  risks: [{ title: 'Rug-pull risk', description: 'Unaudited contracts.' }],
  expectedInteraction: 'Provide single-sided liquidity',
};

describe('OpportunityCard', () => {
  it('renders a blocked banner with the backend reason when flagged', () => {
    render(
      <OpportunityCard
        opportunity={{
          ...BASE,
          blocked: true,
          blockReason: 'Critical exploit or scam indicators detected.',
        }}
        onView={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Critical exploit or scam indicators detected.'),
    ).toBeInTheDocument();
  });

  it('does not render a banner for safe opportunities', () => {
    render(
      <OpportunityCard
        opportunity={{ ...BASE, blocked: false, blockReason: null, score: 91 }}
        onView={vi.fn()}
      />,
    );
    expect(
      screen.queryByText('Critical exploit or scam indicators detected.'),
    ).not.toBeInTheDocument();
  });

  it('shows the on-chain source badge for discovered opportunities', () => {
    render(
      <OpportunityCard
        opportunity={{ ...BASE, source: 'onchain' }}
        onView={vi.fn()}
      />,
    );
    expect(
      screen.getByText('On-chain · self-registered'),
    ).toBeInTheDocument();
  });

  it('does not show the on-chain badge for curated opportunities', () => {
    render(
      <OpportunityCard
        opportunity={{ ...BASE, source: 'curated', blocked: false, score: 91 }}
        onView={vi.fn()}
      />,
    );
    expect(
      screen.queryByText('On-chain · self-registered'),
    ).not.toBeInTheDocument();
  });
});