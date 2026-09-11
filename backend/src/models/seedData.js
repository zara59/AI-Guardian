// Seed data for the local development environment.
//
// Phase 3: these records are a frozen SNAPSHOT of the real provider pipeline
// (DefiLlama yields, CoinGecko prices, on-chain RPC inspection) captured on
// 2026-09-09. They exist purely so development and the deterministic ranking
// tests work offline. `npm run db:setup` and every runtime refresh re-run the
// LIVE pipeline into PostgreSQL; this snapshot is only a fallback when
// providers are unreachable.

import { APP_SNAPSHOT_AT } from './appSnapshot.js';

export const SEED_USER = {
  displayName: 'Guardian Demo User',
};

export const SEED_PREFERENCES = {
  walletAddress: null,
  allocation: 100,
  riskPreference: 'moderate',
};

const BASE_SOURCES = (snapshotAt = APP_SNAPSHOT_AT) => [
  {
    provider: 'decentralized-llama',
    type: 'protocol-data',
    retrievedAt: snapshotAt,
    sourceId: 'defillama-pool',
  },
  {
    provider: 'coingecko',
    type: 'market-data',
    retrievedAt: snapshotAt,
    sourceId: 'coingecko-ids',
  },
  {
    provider: 'on-chain-inspection',
    type: 'blockchain-data',
    retrievedAt: snapshotAt,
    sourceId: 'rpc-ethereum',
  },
];

export const SEED_OPPORTUNITIES = [
  {
    slug: 'ethereum-staking',
    name: 'Ethereum Staking',
    protocol: 'Lido',
    category: 'staking',
    chain: 'Ethereum',
    chainId: 1,
    contractAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    asset: 'STETH',
    assetAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    description:
      'Stake ETH through Lido to secure the Ethereum network and earn rewards. One of the most established and well-understood yield opportunities in DeFi.',
    risk: 'low',
    apy: 2.238,
    apyType: 'APY',
    tvlUsd: 24303516726,
    liquidityRating: 'Very High',
    minimumAllocation: 10,
    expectedInteraction: 'Stake assets',
    exitConditions: 'Unstaking possible but may queue during high demand.',
    whyGuardianLikes:
      'Real pool data shows 2.24% APY on $24.3B of pooled liquidity. Contract verified present on-chain.',
    hardFlags: [],
    eligibility: 'eligible',
    eligibilityReason:
      'Contract is deployed on-chain. Audit claims are not independently verified in this phase.',
    dataConfidence: 'Medium',
    securityStatus: 'verification-incomplete',
    dataSources: BASE_SOURCES(),
    lastUpdated: APP_SNAPSHOT_AT,
    metrics: {
      smartContractSecurity: 8,
      protocolHistory: 7,
      liquidityStability: 5,
      contractPermissions: 3,
      exploitIndicators: 3,
      currentYield: 5,
      historicalSustainability: 4,
      incentives: 2,
      opportunitySize: 4,
      marketConditions: 3,
      businessModel: 5,
      rewardSustainability: 5,
      protocolActivity: 5,
      availableLiquidity: 5,
      withdrawalConditions: 4,
      minimumCapital: 5,
      riskPreferenceFit: 5,
      complexity: 3,
      timeCommitment: 2,
    },
    risks: [
      { title: 'Smart-contract risk', description: 'Staking contracts could contain vulnerabilities, though minimal for battle-tested protocols.' },
      { title: 'Market risk', description: 'The value of ETH may fluctuate independently of staking rewards.' },
      { title: 'Withdrawal conditions', description: 'Staked ETH may face withdrawal queues during high-demand periods.' },
      { title: 'Reward changes', description: 'Staking APR can vary based on total network participation.' },
    ],
  },
  {
    slug: 'stablecoin-lending',
    name: 'Stablecoin Lending',
    protocol: 'Aave v3',
    category: 'lending',
    chain: 'Ethereum',
    chainId: 1,
    contractAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    asset: 'USDC',
    assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    description:
      'Lend USDC on Aave v3 (Ethereum) and earn interest from borrowers. Established DeFi lending with deep liquidity and predictable yields.',
    risk: 'low',
    apy: 3.63536,
    apyType: 'APY',
    tvlUsd: 139090368,
    liquidityRating: 'High',
    minimumAllocation: 50,
    expectedInteraction: 'Deposit stablecoins',
    exitConditions: 'Withdrawals anytime, subject to pool utilization.',
    whyGuardianLikes:
      'Real pool data shows 3.64% APY on $139M of pooled liquidity. Contract verified present on-chain.',
    hardFlags: [],
    eligibility: 'eligible',
    eligibilityReason:
      'Contract is deployed on-chain. Audit claims are not independently verified in this phase.',
    dataConfidence: 'Medium',
    securityStatus: 'verification-incomplete',
    dataSources: BASE_SOURCES(),
    lastUpdated: APP_SNAPSHOT_AT,
    metrics: {
      smartContractSecurity: 8,
      protocolHistory: 7,
      liquidityStability: 4,
      contractPermissions: 3,
      exploitIndicators: 3,
      currentYield: 6,
      historicalSustainability: 4,
      incentives: 2,
      opportunitySize: 4,
      marketConditions: 3,
      businessModel: 5,
      rewardSustainability: 5,
      protocolActivity: 4,
      availableLiquidity: 4,
      withdrawalConditions: 4,
      minimumCapital: 5,
      riskPreferenceFit: 5,
      complexity: 3,
      timeCommitment: 2,
    },
    risks: [
      { title: 'Smart-contract risk', description: 'Lending protocols carry smart-contract risk, though major protocols are well-audited.' },
      { title: 'De-peg risk', description: 'Stablecoins could lose their peg in extreme market conditions.' },
      { title: 'Utilization risk', description: 'High utilization rates can limit withdrawal ability temporarily.' },
    ],
  },
  {
    slug: 'liquidity-provision',
    name: 'Liquidity Provision',
    protocol: 'Uniswap v3',
    category: 'defi',
    chain: 'Ethereum',
    chainId: 1,
    contractAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
    asset: 'USDC/WETH',
    assetAddress: null,
    description:
      'Provide USDC/WETH liquidity to the Uniswap v3 (Ethereum) 0.30% pool and earn trading fees. Returns depend on trading volume and pool composition.',
    risk: 'medium',
    apy: 11.39083,
    apyType: 'APY',
    tvlUsd: 105889612,
    liquidityRating: 'High',
    minimumAllocation: 100,
    expectedInteraction: 'Provide token pair',
    exitConditions:
      'Removal possible within price range; impermanent-loss exposure.',
    whyGuardianLikes:
      'Real pool data shows 11.39% APY on $106M of pooled liquidity. Contract verified present on-chain.',
    hardFlags: [],
    eligibility: 'eligible',
    eligibilityReason:
      'Contract is deployed on-chain. Audit claims are not independently verified in this phase.',
    dataConfidence: 'Medium',
    securityStatus: 'verification-incomplete',
    dataSources: BASE_SOURCES(),
    lastUpdated: APP_SNAPSHOT_AT,
    metrics: {
      smartContractSecurity: 8,
      protocolHistory: 7,
      liquidityStability: 4,
      contractPermissions: 3,
      exploitIndicators: 3,
      currentYield: 8,
      historicalSustainability: 4,
      incentives: 2,
      opportunitySize: 4,
      marketConditions: 3,
      businessModel: 5,
      rewardSustainability: 5,
      protocolActivity: 4,
      availableLiquidity: 4,
      withdrawalConditions: 3,
      minimumCapital: 4,
      riskPreferenceFit: 4,
      complexity: 2,
      timeCommitment: 1,
    },
    risks: [
      { title: 'Impermanent loss', description: 'Price divergence between paired assets can reduce the value of your position.' },
      { title: 'Smart-contract risk', description: 'DEX contracts, while audited, can still contain vulnerabilities.' },
      { title: 'Market volatility', description: 'Sharp price movements can amplify impermanent loss.' },
    ],
  },
];

export const SEED_ACTIVITIES = [
  {
    type: 'analyzed',
    title: 'Ethereum Staking analyzed',
    description: 'Guardian completed security and risk analysis.',
    metadata: { opportunitySlug: 'ethereum-staking' },
  },
  {
    type: 'ranking',
    title: 'Opportunity rankings generated',
    description: 'Opportunities ranked against your preferences.',
    metadata: null,
  },
  {
    type: 'review',
    title: 'Stablecoin Lending reviewed',
    description: 'You reviewed the detailed analysis for Stablecoin Lending.',
    metadata: { opportunitySlug: 'stablecoin-lending' },
  },
  {
    type: 'refresh',
    title: 'Real provider data refreshed',
    description: 'Guardian pulled live yield, TVL, market and on-chain data.',
    metadata: null,
  },
  {
    type: 'pending',
    title: 'Execution pending approval',
    description: 'Liquidity Provision awaiting your confirmation.',
    metadata: { opportunitySlug: 'liquidity-provision' },
  },
];