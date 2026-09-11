import { query } from '../config/db.js';

const OPPORTUNITY_COLUMNS = `
  id, slug, name, protocol, category, chain, description, risk, apy,
  liquidity_rating AS "liquidityRating", minimum_allocation AS "minimumAllocation",
  expected_interaction AS "expectedInteraction", why_guardian_likes AS "whyGuardianLikes",
  risks, hard_flags AS "hardFlags",
  chain_id AS "chainId", contract_address AS "contractAddress", asset,
  asset_address AS "assetAddress", tvl_usd AS "tvlUsd", apy_type AS "apyType",
  data_sources AS "dataSources",
  last_updated AS "lastUpdated", data_confidence AS "dataConfidence",
  eligibility, eligibility_reason AS "eligibilityReason",
  security_status AS "securityStatus",
  source, metadata_uri AS "metadataUri", registered_at AS "registeredAt",
  strategy_address AS "strategyAddress",
  smart_contract_security AS "smartContractSecurity",
  protocol_history AS "protocolHistory",
  liquidity_stability AS "liquidityStability",
  contract_permissions AS "contractPermissions",
  exploit_indicators AS "exploitIndicators",
  current_yield AS "currentYield",
  historical_sustainability AS "historicalSustainability",
  incentives, opportunity_size AS "opportunitySize",
  market_conditions AS "marketConditions",
  business_model AS "businessModel",
  reward_sustainability AS "rewardSustainability",
  protocol_activity AS "protocolActivity",
  available_liquidity AS "availableLiquidity",
  withdrawal_conditions AS "withdrawalConditions",
  minimum_capital AS "minimumCapital",
  risk_preference_fit AS "riskPreferenceFit",
  complexity, time_commitment AS "timeCommitment",
  created_at AS "createdAt"
`;

const RAW_TOTAL_SQL = `
  (smart_contract_security + protocol_history + liquidity_stability +
   contract_permissions + exploit_indicators +
   current_yield + historical_sustainability + incentives +
   opportunity_size + market_conditions + business_model +
   reward_sustainability + protocol_activity + available_liquidity +
   withdrawal_conditions + minimum_capital + risk_preference_fit +
   complexity + time_commitment)
`;

function mapRow(row) {
  if (!row) return null;
  const keepNull = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    ...row,
    risks: row.risks || [],
    hardFlags: row.hardFlags || [],
    dataSources: row.dataSources || [],
    apy: keepNull(row.apy),
    tvlUsd: keepNull(row.tvlUsd),
    minimumAllocation: keepNull(row.minimumAllocation),
  };
}

export async function findAll(filters = {}) {
  const { risk, category, chain, eligibility, minScore, sort, order, limit } = filters;
  const conditions = [];
  const params = [];
  let i = 1;

  if (risk) {
    conditions.push(`risk = $${i++}`);
    params.push(risk);
  }
  if (category) {
    conditions.push(`category = $${i++}`);
    params.push(category);
  }
  if (chain) {
    conditions.push(`chain = $${i++}`);
    params.push(chain);
  }
  if (eligibility) {
    conditions.push(`eligibility = $${i++}`);
    params.push(eligibility);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sortMap = { score: 'total_score', name: 'name', rank: 'id' };
  const sortCol = sortMap[sort] || 'total_score';
  const orderDir = order === 'asc' ? 'ASC' : 'DESC';

  let limitSql = '';
  let filterSql = '';
  if (minScore !== null && minScore !== undefined) {
    filterSql = `WHERE sub.total_score >= $${i++}`;
    params.push(minScore);
  }
  if (limit) {
    limitSql = `LIMIT $${i++}`;
    params.push(limit);
  }

  const result = await query(
    `SELECT sub.*, sub.total_score AS "totalScore"
     FROM (
       SELECT ${OPPORTUNITY_COLUMNS}, ${RAW_TOTAL_SQL} AS total_score
       FROM opportunities
       ${whereClause}
     ) sub
     ${filterSql}
     ORDER BY "{sortCol}" {orderDir}, sub.name ASC
     ${limitSql}`.replace('{sortCol}', sortCol).replace('{orderDir}', orderDir),
    params,
  );
  return result.rows.map(mapRow);
}

export async function findById(id) {
  const result = await query(
    `SELECT ${OPPORTUNITY_COLUMNS} FROM opportunities WHERE id = $1`,
    [id],
  );
  return mapRow(result.rows[0] || null);
}

export async function findBySlug(slug) {
  const result = await query(
    `SELECT ${OPPORTUNITY_COLUMNS} FROM opportunities WHERE slug = $1`,
    [slug],
  );
  return mapRow(result.rows[0] || null);
}

/**
 * Insert a fully-analyzed opportunity record (from the Phase 3 pipeline).
 */
export async function insert(opportunity) {
  const m = opportunity.metrics || {};
  const result = await query(
    `INSERT INTO opportunities (
      slug, name, protocol, category, chain, description, risk, apy,
      liquidity_rating, minimum_allocation, expected_interaction,
      why_guardian_likes, risks, hard_flags,
      chain_id, contract_address, asset, asset_address, tvl_usd, apy_type, data_sources,
      last_updated, data_confidence, eligibility, eligibility_reason, security_status,
      smart_contract_security, protocol_history, liquidity_stability,
      contract_permissions, exploit_indicators, current_yield,
      historical_sustainability, incentives, opportunity_size,
      market_conditions, business_model, reward_sustainability,
      protocol_activity, available_liquidity, withdrawal_conditions,
      minimum_capital, risk_preference_fit, complexity, time_commitment,
      source, metadata_uri, registered_at, strategy_address
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      protocol = EXCLUDED.protocol,
      category = EXCLUDED.category,
      chain = EXCLUDED.chain,
      description = EXCLUDED.description,
      risk = EXCLUDED.risk,
      apy = EXCLUDED.apy,
      liquidity_rating = EXCLUDED.liquidity_rating,
      minimum_allocation = EXCLUDED.minimum_allocation,
      expected_interaction = EXCLUDED.expected_interaction,
      why_guardian_likes = EXCLUDED.why_guardian_likes,
      risks = EXCLUDED.risks,
      hard_flags = EXCLUDED.hard_flags,
      chain_id = EXCLUDED.chain_id,
      contract_address = EXCLUDED.contract_address,
      asset = EXCLUDED.asset,
      asset_address = EXCLUDED.asset_address,
      tvl_usd = EXCLUDED.tvl_usd,
      apy_type = EXCLUDED.apy_type,
      data_sources = EXCLUDED.data_sources,
      last_updated = EXCLUDED.last_updated,
      data_confidence = EXCLUDED.data_confidence,
      eligibility = EXCLUDED.eligibility,
      eligibility_reason = EXCLUDED.eligibility_reason,
      security_status = EXCLUDED.security_status,
      smart_contract_security = EXCLUDED.smart_contract_security,
      protocol_history = EXCLUDED.protocol_history,
      liquidity_stability = EXCLUDED.liquidity_stability,
      contract_permissions = EXCLUDED.contract_permissions,
      exploit_indicators = EXCLUDED.exploit_indicators,
      current_yield = EXCLUDED.current_yield,
      historical_sustainability = EXCLUDED.historical_sustainability,
      incentives = EXCLUDED.incentives,
      opportunity_size = EXCLUDED.opportunity_size,
      market_conditions = EXCLUDED.market_conditions,
      business_model = EXCLUDED.business_model,
      reward_sustainability = EXCLUDED.reward_sustainability,
      protocol_activity = EXCLUDED.protocol_activity,
      available_liquidity = EXCLUDED.available_liquidity,
      withdrawal_conditions = EXCLUDED.withdrawal_conditions,
      minimum_capital = EXCLUDED.minimum_capital,
      risk_preference_fit = EXCLUDED.risk_preference_fit,
      complexity = EXCLUDED.complexity,
      time_commitment = EXCLUDED.time_commitment,
      source = EXCLUDED.source,
      metadata_uri = EXCLUDED.metadata_uri,
      registered_at = EXCLUDED.registered_at,
      strategy_address = EXCLUDED.strategy_address,
      updated_at = now()`,
    [
      opportunity.slug,
      opportunity.name,
      opportunity.protocol,
      opportunity.category,
      opportunity.chain,
      opportunity.description,
      opportunity.risk,
      opportunity.apy,
      opportunity.liquidityRating,
      opportunity.minimumAllocation,
      opportunity.expectedInteraction,
      opportunity.whyGuardianLikes,
      JSON.stringify(opportunity.risks || []),
      JSON.stringify(opportunity.hardFlags || []),
      opportunity.chainId ?? 1,
      opportunity.contractAddress || null,
      opportunity.asset || null,
      opportunity.assetAddress || null,
      opportunity.tvlUsd,
      opportunity.apyType || 'APY',
      JSON.stringify(opportunity.dataSources || []),
      opportunity.lastUpdated,
      opportunity.dataConfidence || 'Low',
      opportunity.eligibility || 'insufficient-data',
      opportunity.eligibilityReason || null,
      opportunity.securityStatus || 'unavailable',
      m.smartContractSecurity,
      m.protocolHistory,
      m.liquidityStability,
      m.contractPermissions,
      m.exploitIndicators,
      m.currentYield,
      m.historicalSustainability,
      m.incentives,
      m.opportunitySize,
      m.marketConditions,
      m.businessModel,
      m.rewardSustainability,
      m.protocolActivity,
      m.availableLiquidity,
      m.withdrawalConditions,
      m.minimumCapital,
      m.riskPreferenceFit,
      m.complexity,
      m.timeCommitment,
      opportunity.source || 'curated', // curated pipeline vs on-chain discovery
      opportunity.metadataUri || null,
      opportunity.registeredAt || null,
      opportunity.strategyAddress || null,
    ],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : bySlugLookup(opportunity.slug);
}

async function bySlugLookup(slug) {
  return findBySlug(slug);
}

/**
 * Remove opportunities that are no longer in the active curated registry.
 * ONLY curated rows (`source = 'curated'`) are eligible — rows discovered
 * on-chain are owned by the discovery pipeline, not the curated registry.
 * Returns the number of removed rows.
 */
export async function removeStaleSlugs(activeSlugs, tx) {
  const result = await query(
    `DELETE FROM opportunities
     WHERE source = 'curated'
       AND NOT (slug = ANY($1))`,
    [activeSlugs],
  );
  return result.rowCount;
}

export async function count() {
  const result = await query('SELECT COUNT(*)::int AS count FROM opportunities');
  return result.rows[0].count;
}

/**
 * Verified, already-posted Guardian strategy assets (source = 'onchain').
 * Used by the web feed to mark pools that trade a guarded asset.
 */
export async function findOnChainAssets() {
  const result = await query(
    `SELECT asset, asset_address AS "assetAddress", slug, chain_id AS "chainId",
            contract_address AS "contractAddress"
       FROM opportunities
      WHERE source = 'onchain'
        AND eligibility = 'eligible'
        AND asset_address IS NOT NULL`,
  );
  return result.rows;
}