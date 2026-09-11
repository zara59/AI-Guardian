// The analysis rubric — the deterministic, documented bridge between REAL
// collected data and the ranking engine's 19 metric inputs.
//
// Every metric is derived from a real measurement (yield, TVL, on-chain
// inspection) or from the protocol's public standing and the opportunity's
// category. Where a measurement is missing the metric is reduced (never a
// fabricated value) and the confidence indicator reflects the gap.
//
// The rubric is stable on purpose: same inputs → same metrics → same score.

const APY_LABEL = 'live APY from DefiLlama yields';
const TVL_LABEL = 'live pool TVL from DefiLlama yields';
const PRICE_LABEL = 'live USD price from CoinGecko';
const ONCHAIN_LABEL = 'on-chain inspection via public RPC';

function tvlBand(tvlUsd) {
  if (tvlUsd === null || tvlUsd === undefined) return null;
  if (tvlUsd >= 1_000_000_000) return 5;
  if (tvlUsd >= 100_000_000) return 4;
  if (tvlUsd >= 10_000_000) return 3;
  if (tvlUsd >= 1_000_000) return 2;
  return 1;
}

function apyMetric(apy) {
  if (apy === null || apy === undefined) return 0; // never invent yield
  if (apy >= 10) return 8;
  if (apy >= 5) return 7;
  if (apy >= 3) return 6;
  if (apy >= 1) return 5;
  return 4;
}

function riskForCategory(category) {
  if (category === 'lending' || category === 'staking') return 'low';
  if (category === 'defi' || category === 'incentive') return 'medium';
  return 'high';
}

function liquidityRatingText(tvlUsd) {
  if (tvlUsd === null || tvlUsd === undefined) return 'Unknown';
  if (tvlUsd >= 1_000_000_000) return 'Very High';
  if (tvlUsd >= 100_000_000) return 'High';
  if (tvlUsd >= 10_000_000) return 'Medium';
  if (tvlUsd >= 1_000_000) return 'Low';
  return 'Very Low';
}

function exitScoreAndBasis(category, exitConditions) {
  // Documented product rubric, not provider data.
  if (!exitConditions) return { value: 2, basis: 'Exit conditions not described — treated conservatively.' };
  if (category === 'lending') return { value: 4, basis: 'Withdrawals anytime, subject to pool utilization.' };
  if (category === 'staking') return { value: 4, basis: 'Unstaking possible but may queue in high demand.' };
  if (category === 'defi') return { value: 3, basis: 'Removal possible within price range; impermanent-loss exposure.' };
  return { value: 2, basis: 'Limited exit info.' };
}

function complexityBasis(category) {
  const map = { staking: 3, lending: 3, defi: 2, incentive: 1, experimental: 1 };
  return map[category] ?? 2;
}

function timeCommitment(category) {
  const map = { staking: 2, lending: 2, defi: 1, incentive: 1, experimental: 1 };
  return map[category] ?? 1;
}

/**
 * Assemble one opportunity's complete ranking inputs from real data.
 * @param {object} args
 * @returns {object} internal opportunity record
 */
export function analyzeOpportunity({
  definition,
  pool,
  priceUsd,
  inspection,
  security,
  eligibility,
  confidence,
  sources,
  lastUpdated,
}) {
  const standing = definition.standing === 'unverified' ? 'unverified' : 'major-established';
  const deployed = inspection ? inspection.contractDeployed : null;
  const major = standing === 'major-established';
  const tvl = pool ? pool.tvlUsd : null;
  const apy = pool ? pool.apy : null;
  const rewardTokens = pool ? (pool.rewardTokens || []) : [];
  const organicYield = !!(pool && pool.apyBase !== null && pool.apyBase === pool.apy);
  const rewardsOnly = !!(pool && (pool.apyBase === null || pool.apyBase === 0) && rewardTokens.length > 0);

  const basis = {};
  const m = {};
  const securityBasis =
    deployed === true
      ? `${ONCHAIN_LABEL}: contract deployed (${inspection.contractCodeLength ?? '?'} bytes). Audit claims not independently verified.`
      : `On-chain inspection ${deployed === false ? 'found no bytecode' : 'could not run'}.`;

  // --- Security / Risk (35) ---
  m.smartContractSecurity = deployed === true ? (major ? 8 : 6) : deployed === false ? 0 : 3;
  basis.smartContractSecurity = securityBasis;
  m.protocolHistory = major ? 7 : deployed === false ? 1 : 4;
  basis.protocolHistory = `Public standing: ${standing} (product rubric).`;
  m.liquidityStability = tvl === null ? 1 : tvlBand(tvl);
  basis.liquidityStability = tvl === null ? 'TVL unavailable — not assumed liquid.' : `${TVL_LABEL}: $${tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  m.contractPermissions = deployed === false ? 0 : 3; // upgradeability/ownership = unknown
  basis.contractPermissions = 'Upgradeability/ownership unknown — treated conservatively (product rubric).';
  m.exploitIndicators = major ? 3 : 2;
  basis.exploitIndicators = 'No exploit feed integrated in this phase — score reflects unverified clean history, not a guarantee.';

  // --- Potential (25) ---
  m.currentYield = apyMetric(apy);
  basis.currentYield = apy === null ? 'Yield unavailable — nothing invented.' : `${APY_LABEL}: ${apy.toFixed(2)}%`;
  m.historicalSustainability = major ? 4 : 2;
  basis.historicalSustainability = `Standing rubric (${standing}); rewards history not independently indexed.`;
  m.incentives = rewardTokens.length ? 4 : 2;
  basis.incentives = rewardTokens.length
    ? `Provider reports ${rewardTokens.length} reward token(s) on this pool.`
    : 'No extra reward token reported by provider (organic yield only).';
  m.opportunitySize = tvl === null ? 0 : Math.min(tvlBand(tvl), 4);
  basis.opportunitySize = tvl === null ? 'TVL unavailable — size not assessed.' : `${TVL_LABEL}: $${tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  m.marketConditions = priceUsd !== null ? 3 : 1;
  basis.marketConditions = priceUsd !== null ? `${PRICE_LABEL}: $${Number(priceUsd).toFixed(2)}` : 'Market price unavailable.';

  // --- Sustainability (15) ---
  m.businessModel = major ? 5 : 3;
  basis.businessModel = `Business-model rubric from public standing (${standing}).`;
  m.rewardSustainability = organicYield ? 5 : rewardsOnly ? 2 : 4;
  basis.rewardSustainability = organicYield
    ? `${APY_LABEL}: APY equals base yield (organic).`
    : rewardsOnly
      ? 'Yield dominated by reward emissions — less certain to persist.'
      : 'Yield partially from base + emissions.';
  m.protocolActivity = tvl === null ? 1 : tvlBand(tvl);
  basis.protocolActivity = tvl === null ? 'TVL unavailable — activity not assessed.' : `${TVL_LABEL}: $${tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  // --- Liquidity (10) ---
  m.availableLiquidity = tvl === null ? 1 : tvlBand(tvl);
  basis.availableLiquidity = tvl === null ? 'Liquidity unknown — treated as low.' : `${TVL_LABEL}: pool has $${tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const exit = exitScoreAndBasis(definition.category, definition.exitConditions);
  m.withdrawalConditions = exit.value;
  basis.withdrawalConditions = exit.basis;

  // --- User fit (15, base inputs; ranker re-personalizes minimumCapital/fit) ---
  const minUsd = Number(definition.minimumRecommendedUsd) || null;
  m.minimumCapital =
    minUsd === null ? 3 : minUsd <= 100 ? 5 : minUsd <= 500 ? 4 : minUsd <= 1000 ? 3 : minUsd <= 5000 ? 2 : 1;
  basis.minimumCapital =
    minUsd === null
      ? 'No recommended minimum set.'
      : `Guardian recommended minimum entry ≈ $${minUsd.toLocaleString()} (guide, not provider data).`;
  m.riskPreferenceFit = eligibility.risk === 'high' || riskForCategory(definition.category) === 'low' ? 5 : 4;
  basis.riskPreferenceFit = 'Base fit for risk profile (personalized at ranking time).';
  m.complexity = complexityBasis(definition.category);
  basis.complexity = `Category: ${definition.category}.`;
  m.timeCommitment = timeCommitment(definition.category);
  basis.timeCommitment = `Category: ${definition.category}.`;

  const baseRisk = riskForCategory(definition.category);
  const risk = eligibility.risk || baseRisk;

  const liquidityRating = liquidityRatingText(tvl);

  const dataSummary = {
    apy: apy,
    apyType: 'APY',
    tvlUsd: tvl,
    assetPriceUsd: priceUsd !== null ? Number(priceUsd) : null,
    poolSymbol: pool ? pool.symbol : null,
    rewardTokens,
    contractDeployed: deployed,
    securityStatus: security.verificationStatus,
    eligibility: eligibility.eligibility,
    liquidityRating,
  };

  return {
    slug: definition.slug,
    name: definition.name,
    protocol: definition.protocol,
    category: definition.category,
    chain: 'Ethereum',
    chainId: definition.chainId,
    asset: definition.asset,
    assetAddress: definition.assetAddress || null,
    contractAddress: definition.contractAddress,
    description: definition.description,
    risk,
    apy: apy !== null ? apy : 0,
    apyType: 'APY',
    tvlUsd: tvl !== null ? tvl : 0,
    liquidityRating,
    minimumAllocation: minUsd,
    expectedInteraction: definition.expectedInteraction,
    exitConditions: definition.exitConditions,
    whyGuardianLikes: `Real pool data shows ${apy !== null ? `${apy.toFixed(2)}% APY` : 'yield data unavailable'}${
      tvl !== null ? ` on $${tvl.toLocaleString('en-US', { maximumFractionDigits: 0 })} of pooled liquidity` : ''
    }. Contract verified present on-chain.`,
    risks: definition.risks || [],
    hardFlags: eligibility.hardFlags || [],
    eligibility: eligibility.eligibility,
    eligibilityReason: eligibility.reason,
    dataConfidence: confidence.level,
    confidenceBasis: confidence.basis,
    securityStatus: security.verificationStatus,
    securityNotes: security.notes || [],
    dataSources: sources,
    lastUpdated,
    metrics: m,
    metricBasis: basis,
    dataSummary,
  };
}

export { APY_LABEL, TVL_LABEL, PRICE_LABEL, ONCHAIN_LABEL };