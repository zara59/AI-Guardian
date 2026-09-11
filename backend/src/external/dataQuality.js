// Data quality evaluation — the safety/data-quality gate that runs BEFORE
// the ranking engine. Produces:
//   - eligibility: eligible | caution | high-risk | avoid | insufficient-data
//   - dataConfidence: High | Medium | Low (supplementary, never replaces score)
//
// Missing information is treated honestly: it reduces confidence and can push
// an opportunity to insufficient-data, but it never fabricates a number.

export const ELIGIBILITY = {
  ELIGIBLE: 'eligible',
  CAUTION: 'caution',
  HIGH_RISK: 'high-risk',
  AVOID: 'avoid',
  INSUFFICIENT_DATA: 'insufficient-data',
};

const CONFIDENCE = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

/**
 * Data-confidence indicator based on which real sources returned data.
 * Supplementary to the score — a high confidence never inflates a score.
 */
export function computeDataConfidence({ hasYield, hasPrice, hasOnchain, securityStatus }) {
  const present = [hasYield, hasPrice, hasOnchain].filter(Boolean).length;

  let level;
  if (present >= 3) level = CONFIDENCE.HIGH;
  else if (present === 2) level = CONFIDENCE.MEDIUM;
  else level = CONFIDENCE.LOW;

  const basis = [`Real provider data available for ${present} of 3 source groups (yield/TVL, market price, on-chain)`];

  if (securityStatus && securityStatus !== 'verification-complete') {
    // Audit/security evidence is not independently verified in Phase 3.
    // Cap the headline confidence so "verification incomplete" is visible.
    if (level === CONFIDENCE.HIGH) {
      level = CONFIDENCE.MEDIUM;
      basis.push('Security verification incomplete — confidence capped at Medium.');
    } else {
      basis.push('Security verification incomplete.');
    }
  }
  if (present <= 1) {
    basis.push('Severe data gaps — treat all analytics with care.');
  }

  return { level, basis };
}

/**
 * Safety/data-quality evaluation for one opportunity.
 * Runs before scoring; critical problems override attractive economics.
 */
export function evaluateEligibility({
  contractDeployed,
  verificationStatus,
  hasYield,
  hasTvl,
}) {
  const reason = (message) => ({ eligibility: ELIGIBILITY.INSUFFICIENT_DATA, reason: message });

  if (contractDeployed === false) {
    return {
      eligibility: ELIGIBILITY.AVOID,
      reason:
        'The registered contract is not deployed on the configured chain. Guardian refuses to evaluate an address with no bytecode.',
      hardFlags: ['contract-not-deployed'],
      risk: 'high',
    };
  }
  if (contractDeployed === null) {
    return reason('On-chain inspection could not be completed (RPC unavailable).');
  }
  if (!hasYield && !hasTvl) {
    return reason('No yield or TVL data could be retrieved from any provider.');
  }

  const verificationIncomplete = verificationStatus === 'verification-incomplete';
  return {
    eligibility: ELIGIBILITY.ELIGIBLE,
    reason: verificationIncomplete
      ? 'Contract is deployed on-chain. Audit claims are not independently verified in this phase.'
      : 'Contract is deployed on-chain and provider data is available.',
    hardFlags: [],
    risk: null, // risk level is assigned by the analysis rubric
    caution: verificationIncomplete,
  };
}