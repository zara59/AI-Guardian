// Mappers that adapt backend API payloads to the shapes the UI components
// already expect. Keeping the mapping centralized means components stay
// focused on presentation.

const CATEGORY_LABELS = {
  staking: 'Staking',
  lending: 'Lending',
  defi: 'DeFi',
  incentive: 'Incentive',
  experimental: 'Experimental',
};

const RISK_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || capitalize(category);
}

export function riskLabel(risk) {
  return RISK_LABELS[risk] || capitalize(risk);
}

export function formatApy(apy) {
  if (apy === null || apy === undefined || apy === '') return '—';
  const num = Number(apy);
  if (!Number.isFinite(num)) return '—';
  const trimmed = num.toFixed(num % 1 === 0 ? 0 : 1);
  return `${trimmed}%`;
}

export function formatTvl(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

const APY_TYPE_LABELS = {
  organic: 'organic',
  base: 'base',
  rewards: 'rewards',
  variable: 'variable',
  fixed: 'fixed',
};

export function apyTypeLabel(apyType) {
  return APY_TYPE_LABELS[apyType] || apyType || 'yield';
}

const CONFIDENCE_LABELS = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function confidenceLabel(level) {
  return CONFIDENCE_LABELS[level] || level || 'Unknown';
}

export function confidenceTone(level) {
  if (level === 'high') return 'green';
  if (level === 'medium') return 'amber';
  return 'orange';
}

export function formatMinimumAllocation(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function sectionValues(breakdown) {
  return {
    security: breakdown.security.value,
    potential: breakdown.potential.value,
    sustainability: breakdown.sustainability.value,
    liquidity: breakdown.liquidity.value,
    userFit: breakdown.userFit.value,
  };
}

export function sectionMaxes(breakdown) {
  return {
    security: breakdown.security.max,
    potential: breakdown.potential.max,
    sustainability: breakdown.sustainability.max,
    liquidity: breakdown.liquidity.max,
    userFit: breakdown.userFit.max,
  };
}

/** Adapts one entry from POST /api/rankings -> UI opportunity card shape. */
export function mapRankedItem(entry) {
  return {
    id: entry.id,
    slug: entry.slug,
    rank: entry.rank,
    name: entry.name,
    category: categoryLabel(entry.category),
    chain: entry.chain,
    protocol: entry.protocol,
    asset: entry.asset,
    contractAddress: entry.contractAddress,
    chainId: entry.chainId,
    score: entry.score,
    rawScore: entry.rawScore,
    scoreLabel: entry.scoreLabel,
    risk: riskLabel(entry.risk),
    apy: formatApy(entry.apy),
    apyType: apyTypeLabel(entry.apyType),
    tvl: formatTvl(entry.tvlUsd),
    confidence: confidenceLabel(entry.dataConfidence),
    confidenceTone: confidenceTone(entry.dataConfidence),
    eligibility: entry.eligibility,
    eligibilityReason: entry.eligibilityReason,
    securityStatus: entry.securityStatus,
    dataSources: entry.dataSources || [],
    lastUpdated: entry.lastUpdated,
    // On-chain discovery provenance (filter-for-web3)
    source: entry.source || 'curated',
    metadataUri: entry.metadataUri || null,
    registeredAt: entry.registeredAt || null,
    strategyAddress: entry.strategyAddress || null,
    liquidity: entry.liquidityRating,
    minimumAllocation: formatMinimumAllocation(entry.minimumAllocation),
    description: entry.description,
    whyGuardianLikesIt: entry.whyGuardianLikes,
    risks: entry.risks || [],
    breakdown: sectionValues(entry.breakdown),
    maxBreakdown: sectionMaxes(entry.breakdown),
    expectedInteraction: entry.expectedInteraction,
    blocked: entry.blocked,
    blockReason: entry.blockReason,
    explanation: entry.explanation,
  };
}

export function mapRankedResult(result) {
  return {
    items: (result?.ranked || []).map(mapRankedItem),
    meta: result?.meta || null,
    updatedAt: result?.meta?.computedAt || null,
  };
}

export function relativeTime(iso) {
  if (!iso) return 'just now';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'just now';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const ACTIVITY_STATUS = {
  analyzed: 'analyzed',
  ranking: 'completed',
  review: 'approved',
  alert: 'pending',
  pending: 'pending',
  executed: 'executed',
};

export function activityStatus(type) {
  return ACTIVITY_STATUS[type] || type || 'completed';
}

/** Adapts one row from GET /api/activities -> UI activity item shape. */
export function mapActivity(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    status: activityStatus(item.type),
    timestamp: relativeTime(item.createdAt ?? item.timestamp),
  };
}

/** Maps backend module status onto the badge vocabulary the UI uses. */
export function moduleStatus(status) {
  if (status === 'ready') return 'completed';
  if (status === 'not-connected') return 'pending';
  return status || 'pending';
}

/** Adapts GET /api/guardian/status -> UI guardian view shape. */
export function mapGuardianStatus(status) {
  return {
    protection: status.protection,
    warning: status.warning,
    infrastructure: status.infrastructure,
    modules: (status.modules || []).map((mod) => ({
      id: mod.id,
      name: mod.name,
      description: mod.description,
      status: moduleStatus(mod.status),
    })),
  };
}

/** Adapts one discovery_web_candidates row -> screening-queue row shape. */
export function mapWebCandidate(candidate) {
  const checks = candidate.screening?.checks || {};
  return {
    key: candidate.candidateKey,
    kind: candidate.kind,
    pool: candidate.pool,
    tokenA: candidate.tokenA,
    tokenB: candidate.tokenB,
    fee: candidate.fee,
    blockNo: candidate.blockNo,
    chainId: candidate.chainId,
    status: candidate.screening?.status || 'pending',
    reason: (candidate.screening?.reasons || []).join(' · '),
    symA: checks.a?.symbol || '—',
    symB: checks.b?.symbol || '—',
    decimalsA: checks.a?.decimals ?? '—',
    decimalsB: checks.b?.decimals ?? '—',
    deployedA: checks.a?.deployed,
    deployedB: checks.b?.deployed,
    guardianLinked: Boolean(candidate.guardianLinked),
    linkedSlug: candidate.linkedSlug || null,
    postedSlug: candidate.postedSlug || null,
    postedAt: candidate.postedAt || null,
    hasLiquidity: Boolean(candidate.screening?.liquidity?.hasLiquidity),
    screenedAt: candidate.screening?.screenedAt || null,
  };
}

/** Adapts GET /api/opportunities/discovery -> discovery view shape. */
export function mapDiscovery(data) {
  return {
    chains: (data?.chains || []).map((c) => ({
      chainId: c.chainId,
      lastBlock: c.lastBlock,
      updatedAt: c.updatedAt,
    })),
    webfeed: {
      summary: (data?.webfeed?.summary || []).map((s) => ({
        chainId: s.chainId,
        candidates: s.candidates,
        screened: s.screened,
        flagged: s.flagged,
        guardianLinked: s.guardianLinked,
        posted: s.posted ?? 0,
      })),
      candidates: (data?.webfeed?.candidates || []).map(mapWebCandidate),
    },
  };
}