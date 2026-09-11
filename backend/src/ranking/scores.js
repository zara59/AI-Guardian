export const SCORE_WEIGHTS = {
  security: {
    max: 35,
    parts: [
      { key: 'smartContractSecurity', max: 10 },
      { key: 'protocolHistory', max: 8 },
      { key: 'liquidityStability', max: 6 },
      { key: 'contractPermissions', max: 5 },
      { key: 'exploitIndicators', max: 6 },
    ],
  },
  potential: {
    max: 25,
    parts: [
      { key: 'currentYield', max: 8 },
      { key: 'historicalSustainability', max: 5 },
      { key: 'incentives', max: 5 },
      { key: 'opportunitySize', max: 4 },
      { key: 'marketConditions', max: 3 },
    ],
  },
  sustainability: {
    max: 15,
    parts: [
      { key: 'businessModel', max: 5 },
      { key: 'rewardSustainability', max: 5 },
      { key: 'protocolActivity', max: 5 },
    ],
  },
  liquidity: {
    max: 10,
    parts: [
      { key: 'availableLiquidity', max: 5 },
      { key: 'withdrawalConditions', max: 5 },
    ],
  },
  userFit: {
    max: 15,
    parts: [
      { key: 'minimumCapital', max: 5 },
      { key: 'riskPreferenceFit', max: 5 },
      { key: 'complexity', max: 3 },
      { key: 'timeCommitment', max: 2 },
    ],
  },
};

export const TOTAL_MAX = 100;

export function scoreLabel(score) {
  if (score >= 80) return 'Strong Candidate';
  if (score >= 65) return 'Worth Considering';
  if (score >= 45) return 'High Caution';
  return 'Avoid';
}

export function riskColor(score) {
  if (score >= 80) return 'green';
  if (score >= 65) return 'amber';
  if (score >= 45) return 'orange';
  return 'red';
}

// User-fit preference matrix. A low-risk opportunity fits a conservative
// user best; a high-risk opportunity only fits an aggressive user well.
const RISK_PREF_FIT_MATRIX = {
  conservative: { low: 5, medium: 3, high: 1 },
  moderate: { low: 5, medium: 5, high: 2 },
  aggressive: { low: 2, medium: 4, high: 5 },
};

export function computeRiskPreferenceFit(risk, riskPreference) {
  const row = RISK_PREF_FIT_MATRIX[riskPreference] || RISK_PREF_FIT_MATRIX.moderate;
  return row[risk] ?? 2;
}

export function computeMinimumCapitalFit(minimumAllocation, allocation) {
  if (!minimumAllocation) return 5;
  if (allocation >= minimumAllocation) return 5;
  const ratio = allocation / minimumAllocation;
  return Math.max(0, Math.min(5, Math.round(5 * ratio)));
}