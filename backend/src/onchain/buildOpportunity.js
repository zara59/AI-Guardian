// Build a rankable opportunity record from a validated on-chain registration.
//
// The SAME analyzeOpportunity rubric used for curated opportunities is reused
// here so discovered entries feed the ranking engine identically. Yield comes
// ONLY from Guardian's own on-chain share-price sampling; nothing is pulled
// from external aggregators (the "no external help" requirement).

import { analyzeOpportunity } from '../external/analysis.js';

const EXCHANGE_RATE_LABEL =
  'Guardian on-chain sampling of the vault share price (totalAssets/totalSupply)';

/**
 * @param {object} args
 * @param {object} args.registration decoded GuardianRegistry entry
 * @param {object} args.validation result of validateRegistration()
 * @param {number|null} args.apy annualized percent from share-price sampling
 * @param {string} args.networkId network id (ethereum/sepolia)
 * @param {number} args.chainId real chain id
 * @param {string} args.lastUpdated ISO timestamp
 * @param {string} args.tokenSymbol on-chain symbol of the registered token
 * @param {number} args.tokenDecimals on-chain decimal scale
 * @returns {object} opportunity record tagged source='onchain'
 */
export function buildDiscoveredOpportunity({
  registration,
  validation,
  apy,
  networkId,
  chainId,
  lastUpdated,
  tokenSymbol,
  tokenDecimals,
}) {
  const strategy = registration.strategy.toLowerCase();
  const slug = `onchain:${chainId}:${strategy}`;
  const codeLengths = validation.codeLengths || {};

  const definition = {
    slug,
    name: registration.name,
    protocol: registration.name,
    category: 'defi',
    network: networkId,
    chainId,
    asset: tokenSymbol || 'ERC-20',
    assetAddress: registration.token,
    contractAddress: registration.vault,
    description:
      registration.description ||
      'Self-registered Guardian yield strategy discovered on-chain. Guardian verified the strategy interface and vault wiring by reading the chain.',
    standing: 'unverified', // self-registered — NOT major-established
    defiLlamaProject: null,
    defiLlamaPoolId: null,
    coingeckoIds: [],
    minimumRecommendedUsd: null,
    expectedInteraction: 'Deposit into the registered Guardian vault.',
    exitConditions: 'Withdraw via the registered vault (subject to strategy liquidity).',
    risks: [
      {
        title: 'Unproven protocol',
        description:
          'Self-registered on-chain. Guardian verified the strategy interface, vault wiring and token shape, but this is not a battle-tested, independently audited protocol.',
      },
      {
        title: 'Smart-contract risk',
        description: 'The strategy and vault are new contracts whose security was only partially validated by Guardian.',
      },
      {
        title: 'Unverified yield',
        description: 'APY is derived only from Guardian’s own share-price sampling and has no third-party record.',
      },
    ],
  };

  const pool = {
    id: slug,
    symbol: tokenSymbol || 'ERC-20',
    chain: networkId,
    apy: apy ?? null,
    apyBase: apy ?? null,
    tvlUsd: null, // no oracle — never fabricated
    rewardTokens: [],
  };

  const inspection = {
    network: networkId,
    chainId,
    contractDeployed: true,
    contractCodeLength: codeLengths.vault || null,
    tokenDecimals,
  };

  const security = {
    provider: 'on-chain-registry',
    verificationStatus: 'verification-incomplete',
    contractDeployed: true,
    contractCodeLength: codeLengths.vault || null,
    tokenDecimals,
    upgradeability: 'unknown',
    ownership: 'unknown',
    pauseControl: validation.checks.paused ? 'paused' : 'active',
    notes: [
      'Self-registered in GuardianRegistry; Guardian re-validated on-chain.',
      `Strategy interface isGuardianStrategy() verified.`,
      `Vault asset() matches the registered token; vault.strategy() == registered strategy.`,
    ],
  };

  const eligibility = {
    eligibility: 'eligible',
    risk: 'medium',
    reason:
      'On-chain validated: Guardian strategy interface, vault wiring and token shape all verified by reading the chain.',
    hardFlags: [],
  };

  const confidence = {
    level: 'Medium',
    basis: [
      'Self-registered and independently re-validated on-chain. Yield from Guardian’s own share-price sampling; no third-party data.',
    ],
  };

  const sources = [
    {
      provider: 'on-chain-registry',
      type: 'blockchain-data',
      retrievedAt: lastUpdated,
      sourceId: `chain:${chainId}`,
    },
    { provider: 'on-chain-share-price', type: 'self-sampled', retrievedAt: lastUpdated, sourceId: slug },
  ];

  const requiredForRanking = analyzeOpportunity({
    definition,
    pool,
    priceUsd: null,
    inspection,
    security,
    eligibility,
    confidence,
    sources,
    lastUpdated,
  });

  // Provenance tags the curated pipeline does not have. `apy`/`tvlUsd` are
  // forced back to null (never a fabricated 0) because neither is externally
  // sourced: yield comes only from Guardian's own share-price sampling, and
  // TVL needs an oracle we refuse to fake.
  return {
    ...requiredForRanking,
    apy: apy ?? null,
    tvlUsd: null,
    source: 'onchain',
    strategyAddress: strategy,
    metadataUri: registration.metadataUri || null,
    registeredAt: registration.registeredAt,
    whyGuardianLikes: `Discovered on-chain via GuardianRegistry. ${apy !== null && apy > 0 ? `Share-price sampling shows ~${apy.toFixed(2)}% APY (${EXCHANGE_RATE_LABEL}).` : 'Yield not yet measurable — Guardian is sampling the share price and will fill this in once enough time has passed.'}`,
    dataSummary: {
      ...requiredForRanking.dataSummary,
      apy: apy ?? null,
      apyType: 'APY',
      source: 'onchain',
    },
  };
}

const POOL_NAMES = { v2: 'Uniswap V2', v3: 'Uniswap V3' };

function symbolPair(a, b) {
  const left = (a?.symbol || 'TOKEN').slice(0, 24);
  const right = (b?.symbol || 'TOKEN').slice(0, 24);
  return `${left}/${right}`;
}

/**
 * Build a rankable opportunity from a web-feed candidate that passed the
 * legit gate: BOTH tokens screened web3-true AND the live pool holds real
 * on-chain liquidity (getReserves / slot0+liquidity read at scan time).
 *
 * Yield/TVL are NEVER fabricated: no price oracle exists in this product
 * layer, so `apy` and `tvlUsd` are forced back to null and the raw reserve
 * evidence is kept instead. This is the "post what the app qualifies" step —
 * everything else stays in the screening queue.
 *
 * @param {object} args
 * @param {object} args.candidate decoded pool candidate ({kind,pool,tokenA,tokenB,fee,blockNo})
 * @param {object} args.checks token screening ({a:{deployed,decimals,symbol}, b:{...}})
 * @param {object} args.liquidity on-chain liquidity evidence (BigInt fields)
 * @param {string} args.networkId network id (ethereum/sepolia)
 * @param {number} args.chainId real chain id
 * @param {string} args.lastUpdated ISO timestamp
 * @returns {object} opportunity record tagged source='webfeed'
 */
export function buildWebFeedOpportunity({
  candidate,
  checks,
  liquidity,
  networkId,
  chainId,
  lastUpdated,
}) {
  const kind = candidate.kind;
  const slug = `webfeed:${chainId}:${kind}:${candidate.pool.toLowerCase()}`;
  const symbolA = checks?.a?.symbol || 'ERC-20';
  const symbolB = checks?.b?.symbol || 'ERC-20';
  const pairLabel = symbolPair(checks?.a, checks?.b);
  const liquidityNote =
    liquidity?.kind === 'v2'
      ? `live V2 reserves ${liquidity.reserveA.toString()} / ${liquidity.reserveB.toString()} (base units)` // eslint-disable-line no-irregular-whitespace
      : liquidity?.kind === 'v3'
        ? `live V3 liquidity ${liquidity.liquidity.toString()} at tick ${liquidity.tick}` // eslint-disable-line no-irregular-whitespace
        : 'live pool liquidity confirmed on-chain';

  const definition = {
    slug,
    name: pairLabel,
    protocol: POOL_NAMES[kind] || 'Uniswap',
    category: 'defi',
    network: networkId,
    chainId,
    asset: pairLabel.slice(0, 48),
    assetAddress: candidate.tokenA,
    contractAddress: candidate.pool,
    description: `A brand-new public ${POOL_NAMES[kind] || 'Uniswap'} pool (created on-chain at block ${candidate.blockNo}) whose tokens and liquidity were verified by reading the chain: both assets expose real ERC-20 shape (bytecode, 6–18 decimals, readable symbol) and the pool holds ${liquidityNote}. Yield and USD TVL are not available because no price oracle is used — nothing was invented to fill them in.`,
    standing: 'unverified',
    defiLlamaProject: null,
    defiLlamaPoolId: null,
    coingeckoIds: [],
    minimumRecommendedUsd: null,
    expectedInteraction: 'Provide liquidity to the public pool and earn swap fees.',
    exitConditions: 'Withdraw liquidity at any time (standard AMM LP; value subject to price range and impermanent loss).',
    risks: [
      {
        title: 'Brand-new, unproven pool',
        description:
          'Created within the scanned window and surfaced from the public chain. The screen is structural (token bytecode, decimals, symbol) plus live liquidity — it is not a honeypot/tokenomics audit.',
      },
      {
        title: 'Yield and TVL unmeasured',
        description:
          'No price oracle is used, so APY and USD TVL are honestly null. Raw on-chain reserves are recorded as evidence only.',
      },
      {
        title: 'Impermanent loss',
        description: 'Standard AMM liquidity provision carries price-range and impermanent-loss exposure.',
      },
    ],
  };

  const pool = {
    id: slug,
    symbol: pairLabel,
    chain: networkId,
    apy: null,
    apyBase: null,
    tvlUsd: null, // no oracle — never fabricated
    rewardTokens: [],
  };

  const inspection = {
    network: networkId,
    chainId,
    contractDeployed: true,
    contractCodeLength: null,
    tokenDecimals: checks?.a?.decimals ?? null,
  };

  const security = {
    provider: 'on-chain-pool-scan',
    verificationStatus: 'verification-incomplete',
    contractDeployed: true,
    contractCodeLength: null,
    tokenDecimals: checks?.a?.decimals ?? null,
    upgradeability: 'unknown',
    ownership: 'unknown',
    pauseControl: 'unknown',
    notes: [
      `Both tokens verified on-chain: bytecode present, decimals ${checks?.a?.decimals ?? '?'}/${checks?.b?.decimals ?? '?'}, readable symbols ${symbolA}/${symbolB}.`,
      `Pool holds ${liquidityNote}.`,
      `Discovered from a ${kind === 'v2' ? '"PairCreated"' : '"PoolCreated"'} log at block ${candidate.blockNo}.`,
    ],
  };

  const eligibility = {
    eligibility: 'eligible',
    risk: 'medium',
    reason:
      'On-chain qualified: both tokens pass the token screen and the pool holds live on-chain liquidity at scan time.',
    hardFlags: [],
  };

  const confidence = {
    level: 'Low',
    basis: [
      'Structural on-chain verification only (token shape + live liquidity). Yield/TVL intentionally null — no oracle, no fabrication.',
    ],
  };

  const sources = [
    {
      provider: 'on-chain-pool-scan',
      type: 'blockchain-data',
      retrievedAt: lastUpdated,
      sourceId: `chain:${chainId}`,
    },
  ];

  const requiredForRanking = analyzeOpportunity({
    definition,
    pool,
    priceUsd: null,
    inspection,
    security,
    eligibility,
    confidence,
    sources,
    lastUpdated,
  });

  return {
    ...requiredForRanking,
    apy: null, // honest: yield not measurable without time-series sampling
    tvlUsd: null, // honest: no price oracle
    source: 'webfeed',
    strategyAddress: null,
    metadataUri: null,
    registeredAt: null,
    whyGuardianLikes: `Legit pool surfaced from the public chain and qualified on-chain: ${symbolA}/${symbolB} exposes real ERC-20 shape and the pool holds ${liquidityNote}. Yield and TVL are not fabricated (no price oracle).`,
    dataSummary: {
      ...requiredForRanking.dataSummary,
      apy: null,
      apyType: 'APY',
      source: 'webfeed',
      liquidityEvidence: {
        kind: liquidity?.kind || null,
        hasLiquidity: Boolean(liquidity?.hasLiquidity),
        ...(liquidity?.kind === 'v2'
          ? { reserveA: liquidity.reserveA.toString(), reserveB: liquidity.reserveB.toString() }
          : richnessV3(liquidity)),
      },
    },
  };
}

function richnessV3(liquidity) {
  if (liquidity?.kind !== 'v3') return {};
  return {
    liquidity: liquidity.liquidity.toString(),
    sqrtPriceX96: liquidity.sqrtPriceX96.toString(),
    tick: liquidity.tick,
  };
}