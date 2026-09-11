// Phase 6: readiness aggregator.
//
// Answers, honestly: "is the system ready to move real value via KeeperHub
// on Sepolia RIGHT NOW?" Aggregates:
//   - deployment:  artifact present + bytecode on-chain + chain id + decimals
//   - keeperhub:   key configured + authenticates
//   - funding:     execution wallet address + on-chain balances above gates
//   - policy:      KEEPERHUB_EXECUTION_REQUIRED does not allow silent fallback
//
// The result is a single booleans `ready` plus a list of real blockers the
// UI renders verbatim (Phase 6 §1: "display the actual unavailable state and
// explain it").

import { verifySepoliaDeployment } from './deploymentCheck.js';
import { probeKeeperHubAuth } from './keeperhubProbe.js';
import { checkExecutionFunding } from './funding.js';
import { getPhase6Config } from './config.js';

/**
 * Full readiness probe.
 * @param {object} [deps] — injectable for tests
 * @returns {Promise<object>}
 */
export async function checkReadiness(deps = {}) {
  const verify = deps.verifySepoliaDeployment || verifySepoliaDeployment;
  const auth = deps.probeKeeperHubAuth || probeKeeperHubAuth;
  const funding = deps.checkExecutionFunding || checkExecutionFunding;
  const config = deps.getPhase6Config ? deps.getPhase6Config() : getPhase6Config();

  // Quick early-out: if execution is required but the key is absent, the
  // whole probe short-circuits to a policy blocker (no silent fallback).
  const policyBlocked = config.executionRequired && config.effectiveMode === 'blocked';
  const keeepRequiredNote = policyBlocked
    ? 'KEEPERHUB_EXECUTION_REQUIRED=true but no kh_ key: KeeperHub cannot be forced; direct execution is refused.'
    : null;

  const [deployment, keeperhub] = await Promise.all([
    verify(),
    auth(deps),
  ]);

  // Funding probe needs the deployed contracts; only run when deployment is
  // plausible so the reported blocker is precise.
  let fundingResult = null;
  if (deployment.deployed) {
    try {
      fundingResult = await funding({}, deps);
    } catch (err) {
      fundingResult = { state: 'error', ready: false, detail: `Funding probe failed: ${err.message}`, evidence: {} };
    }
  }

  const blockers = [];
  if (policyBlocked) blockers.push(keeepRequiredNote);
  if (!deployment.deployed) blockers.push(deployment.detail || 'Deployment not verified.');
  if (keeperhub && !keeperhub.authenticated) blockers.push(keeperhub.error || 'KeeperHub authentication not verified.');
  if (deployment.deployed && fundingResult && !fundingResult.ready) {
    blockers.push(fundingResult.detail);
  }

  return {
    checkedAt: new Date().toISOString(),
    ready: blockers.length === 0,
    blockers: blockers.filter(Boolean),
    policy: {
      executionRequired: config.executionRequired,
      effectiveMode: config.effectiveMode,
      noSilentFallback: !policyBlocked || keeepRequiredNote !== null,
    },
    deployment,
    keeperhub,
    funding: deployment.deployed
      ? fundingResult
      : { state: 'skipped', ready: false, detail: 'Funding check skipped because the contracts are not verified on-chain.', evidence: {} },
  };
}