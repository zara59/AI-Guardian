import * as opportunityService from '../services/opportunityService.js';
import { refreshOpportunities } from '../services/refreshService.js';
import {
  listDiscoveryStates,
  listWebCandidates,
  webFeedSummary,
} from '../onchain/discoveryRepository.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, ApiError } from '../utils/response.js';
import { validateQueryParams } from '../utils/validators.js';
import { parseOpportunityId } from '../middleware/parseOpportunityId.js';

const SCORE_KEYS = [
  'smartContractSecurity', 'protocolHistory', 'liquidityStability',
  'contractPermissions', 'exploitIndicators', 'currentYield',
  'historicalSustainability', 'incentives', 'opportunitySize',
  'marketConditions', 'businessModel', 'rewardSustainability',
  'protocolActivity', 'availableLiquidity', 'withdrawalConditions',
  'minimumCapital', 'riskPreferenceFit', 'complexity', 'timeCommitment',
];

// Deterministic fallback total used when the client asks for score ordering
// outside a personalized ranking context. Matches the ranking engine's raw
// opportunity sum for the default (moderate, 100) context.
function computeRawTotal(opp) {
  return SCORE_KEYS.reduce((sum, k) => sum + (Number(opp[k]) || 0), 0);
}

export const list = asyncHandler(async (req, res) => {
  const { risk, category, chain, sort, order, limit, minScore } =
    validateQueryParams(req.query);
  const filters = { risk, category, chain, sort, order, limit, minScore };

  const result = await opportunityService.listOpportunities(filters);
  let items = result.items;

  if (sort === 'score' && items.length) {
    items = items
      .map((opp) => ({ ...opp, totalScore: Math.round(computeRawTotal(opp)) }))
      .sort((a, b) =>
        order === 'asc' ? a.totalScore - b.totalScore : b.totalScore - a.totalScore,
      );
  }

  return ok(res, { items, count: items.length });
});

export const getById = asyncHandler(async (req, res) => {
  const { id, slug } = await parseOpportunityId(req.params.id);
  if (id) {
    const row = await opportunityService.getOpportunityById(id);
    return ok(res, row);
  }
  const { items } = await opportunityService.listOpportunities({});
  const match = items.find((o) => o.slug === slug);
  if (!match) throw new ApiError(404, 'Opportunity not found', 'OPPORTUNITY_NOT_FOUND');
  return ok(res, match);
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const report = await refreshOpportunities({ force: true });
    return created(res, report);
  } catch (err) {
    throw new ApiError(
      502,
      `Provider refresh failed: ${err.message}`,
      'PROVIDER_UNAVAILABLE',
    );
  }
});

/** GET /api/opportunities/discovery — registry cursors + web-feed screening queue. */
export const discovery = asyncHandler(async (req, res) => {
  const states = await listDiscoveryStates();

  // Web → web3 screening queue. Never a rankable opportunity by itself;
  // the queue is the honest "filter" surface (screened / flagged, pending
  // since nothing is auto-posted without the Guardian gate).
  const [feed, candidates] = await Promise.all([
    webFeedSummary(),
    listWebCandidates({ limit: 200 }),
  ]);

  return ok(res, { chains: states, webfeed: { summary: feed, candidates } });
});