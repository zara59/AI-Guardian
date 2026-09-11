// Hard safety filters run BEFORE scoring. Safety takes priority over
// attractive returns: a critical issue caps the opportunity regardless of
// how high the potential score would otherwise be.

const CRITICAL_FLAGS = ['critical-exploit-possible', 'rug-pull', 'exploited'];
const SUSPICIOUS_FLAGS = ['suspicious-permissions', 'unaudited-contract'];

/**
 * Evaluate an opportunity against hard safety rules.
 * @returns {{
 *   blocked: boolean,
 *   blockReason: string | null,
 *   effectiveRisk: string,
 * }}
 */
export function applySafetyFilters(opportunity, ctx = {}) {
  const flags = opportunity.hardFlags || [];
  const securityEvidence =
    (opportunity.smartContractSecurity ?? 0) +
    (opportunity.protocolHistory ?? 0);

  // Rule 1: critical exploit / rug-pull / proven exploit -> block outright.
  if (flags.some((f) => CRITICAL_FLAGS.includes(f))) {
    return {
      blocked: true,
      blockReason:
        'Critical exploit or scam indicators detected. Guardian cannot recommend this opportunity.',
      effectiveRisk: 'high',
    };
  }

  // Rule 2: suspicious permissions with weak security evidence -> treat as high risk.
  if (flags.some((f) => SUSPICIOUS_FLAGS.includes(f)) && securityEvidence < 8) {
    return {
      blocked: true,
      blockReason:
        'Suspicious contract permissions combined with insufficient security evidence.',
      effectiveRisk: 'high',
    };
  }

  // Rule 3: extremely low liquidity -> treat as high risk (not blocked outright).
  if ((opportunity.available_liquidity ?? opportunity.availableLiquidity ?? 5) <= 1) {
    return {
      blocked: false,
      blockReason: null,
      effectiveRisk: 'high',
    };
  }

  return {
    blocked: false,
    blockReason: null,
    effectiveRisk: opportunity.risk,
  };
}