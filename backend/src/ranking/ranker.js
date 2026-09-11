import { SCORE_WEIGHTS, TOTAL_MAX, scoreLabel, riskColor, computeRiskPreferenceFit, computeMinimumCapitalFit } from './scores.js';
import { applySafetyFilters } from './safetyFilters.js';

function clamp(value, min, max) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return min;
  return Math.max(min, Math.min(max, Number(value)));
}

/**
 * Compute the deterministic 100-point score for one opportunity.
 * Personalization replaces the stored fit sub-scores with values derived
 * from the user's allocation and risk preference.
 */
export function computeScore(opportunity, { allocation, riskPreference }) {
  const sections = {};
  let total = 0;

  for (const [section, def] of Object.entries(SCORE_WEIGHTS)) {
    let sum = 0;
    const parts = def.parts.map((part) => {
      let value;
      if (section === 'userFit' && part.key === 'minimumCapital') {
        value = computeMinimumCapitalFit(opportunity.minimumAllocation, allocation);
      } else if (section === 'userFit' && part.key === 'riskPreferenceFit') {
        value = computeRiskPreferenceFit(opportunity.risk, riskPreference);
      } else {
        value = clamp(opportunity[part.key], 0, part.max);
      }
      sum += value;
      return { key: part.key, value, max: part.max };
    });
    sections[section] = {
      value: sum,
      max: def.max,
      parts,
    };
    total += sum;
  }

  return { total: Math.round(total), sections, maxScore: TOTAL_MAX };
}

function buildBreakdown(sections) {
  return {
    security: { value: sections.security.value, max: sections.security.max },
    potential: { value: sections.potential.value, max: sections.potential.max },
    sustainability: { value: sections.sustainability.value, max: sections.sustainability.max },
    liquidity: { value: sections.liquidity.value, max: sections.liquidity.max },
    userFit: { value: sections.userFit.value, max: sections.userFit.max },
  };
}

function buildDetails(sections) {
  const out = {};
  for (const [section, def] of Object.entries(sections)) {
    out[section] = def.parts.map((p) => ({ label: p.key, value: p.value, max: p.max }));
  }
  return out;
}

function explainPosition({ opportunity, score, safety, risk }) {
  const parts = [];
  if (safety.blocked) {
    parts.push(safety.blockReason);
  }
  if (score >= 80) {
    parts.push('Strong protocol maturity, high liquidity and a relatively simple user experience make this a strong fit.');
  } else if (score >= 65) {
    parts.push('Above-average metrics across security, potential and sustainability, but with some factors to keep an eye on.');
  } else if (score >= 45) {
    parts.push('Weaknesses in security, liquidity or user fit offset the headline returns.');
  } else {
    parts.push('Critical risks or very poor fit dominate the opportunity.');
  }
  if (risk === 'high') {
    parts.push('Only appropriate for an experienced user who understands the risks.');
  }
  return parts.join(' ');
}

function capBlocked(score) {
  return Math.min(score, 24); // blocked opportunities stay in the "Avoid" band
}

/**
 * Rank opportunities deterministically.
 * @returns {{ ranked: Array, meta: Object }}
 */
export function rankOpportunities(opportunities, { allocation, riskPreference }) {
  const evaluated = opportunities.map((opp) => {
    const safety = applySafetyFilters(opp);
    const { total, sections } = computeScore(opp, { allocation, riskPreference });
    const rawScore = total;
    const cappedScore = safety.blocked ? capBlocked(total) : total;

    return {
      opportunity: opp,
      safety,
      score: {
        total: cappedScore,
        rawScore,
        max: TOTAL_MAX,
        label: scoreLabel(cappedScore),
        color: riskColor(cappedScore),
        breakdown: buildBreakdown(sections),
        details: buildDetails(sections),
      },
    };
  });

  // Deterministic sort: score desc, then name asc, then id asc.
  evaluated.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (a.opportunity.name !== b.opportunity.name) {
      return a.opportunity.name < b.opportunity.name ? -1 : 1;
    }
    return a.opportunity.id - b.opportunity.id;
  });

  const ranked = evaluated.map((e, index) => {
    const opp = e.opportunity;
    return {
      rank: index + 1,
      id: opp.id,
      slug: opp.slug,
      name: opp.name,
      category: opp.category,
      chain: opp.chain,
      protocol: opp.protocol,
      asset: opp.asset,
      contractAddress: opp.contractAddress,
      chainId: opp.chainId,
      risk: e.safety.effectiveRisk,
      apy: Number(opp.apy),
      apyType: opp.apyType,
      tvlUsd: Number(opp.tvlUsd),
      dataConfidence: opp.dataConfidence,
      eligibility: opp.eligibility,
      eligibilityReason: opp.eligibilityReason,
      securityStatus: opp.securityStatus,
      dataSources: opp.dataSources || [],
      lastUpdated: opp.lastUpdated,
      liquidityRating: opp.liquidityRating,
      minimumAllocation: opp.minimumAllocation,
      description: opp.description,
      expectedInteraction: opp.expectedInteraction,
      whyGuardianLikes: opp.whyGuardianLikes,
      risks: opp.risks || [],
      hardFlags: opp.hardFlags || [],
      blocked: e.safety.blocked,
      blockReason: e.safety.blockReason,
      score: e.score.total,
      rawScore: e.score.rawScore,
      scoreMax: e.score.max,
      scoreLabel: e.score.label,
      scoreColor: e.score.color,
      breakdown: e.score.breakdown,
      details: e.score.details,
      explanation: explainPosition({
        opportunity: opp,
        score: e.score.total,
        safety: e.safety,
        risk: e.safety.effectiveRisk,
      }),
    };
  });

  return {
    ranked,
    meta: {
      requestedWith: { allocation, riskPreference },
      computedAt: new Date().toISOString(),
      rankingMethod: '100-point deterministic framework (security 35, potential 25, sustainability 15, liquidity 10, user fit 15)',
      note: 'Guardian never guarantees returns. Scores are a risk-aware recommendation, not financial advice.',
    },
  };
}