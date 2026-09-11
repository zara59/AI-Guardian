// Security provider — honest, evidence-based security assessment.
//
// Phase 3 does not integrate a paid/free audit-registry API. Instead the
// provider performs REAL on-chain inspection (via RPC) and returns a status
// that never overstates safety:
//   - contractDeployed        — real bytecode check (eth_getCode)
//   - tokenDecimals decoded   — real on-chain token metadata
//   - verificationStatus      — always 'verification-incomplete': Guardian
//                                does not claim a protocol is audited/safe
//   - upgradeability/ownership/pause — 'unknown' unless determinable
//
// A missing audit trail therefore REDUCES the security score, never boosts it.
// See Web3 Data/data-sources.md for the rationale.

import * as blockchainProvider from './blockchainProvider.js';
import { logger } from '../utils/logger.js';

export const SECURITY_STATES = {
  VERIFICATION_INCOMPLETE: 'verification-incomplete',
  UNAVAILABLE: 'unavailable',
  OK: 'ok',
};

/**
 * Inspect an opportunity's contracts on-chain and produce the honest
 * security evaluation record. Accepts an optional already-fetched inspection
 * (raw `inspectContracts` shape or the orchestrator's normalized shape).
 * @param {{chainId:number, contractAddress:string, assetAddress:string, standing:string}} def
 * @param {object|null} [inspection]
 */
export async function evaluateSecurity(def, inspection = null, options = {}) {
  if (!inspection) {
    try {
      inspection = await blockchainProvider.inspectContracts(def, options);
    } catch (err) {
      logger.warn('On-chain inspection unavailable', { message: err.message });
    }
  }

  const deployed =
    inspection?.contractDeployed ??
    (inspection.contract ? Boolean(inspection.contract.deployed) : null);
  const codeLength =
    inspection?.contractCodeLength ??
    inspection?.contract?.bytecodeLength ??
    null;
  const tokenDecimals = inspection?.tokenDecimals ?? null;

  const notes = [];
  if (inspection) {
    notes.push(
      deployed
        ? 'Contract verified deployed on Ethereum mainnet (real bytecode check).'
        : 'Contract bytecode NOT found at the configured address.',
    );
    if (def.standing === 'major-established') {
      notes.push('Major, long-established protocol by public record.');
    }
  } else {
    notes.push('On-chain inspection could not be completed.');
  }

  const status =
    inspection && deployed ? SECURITY_STATES.VERIFICATION_INCOMPLETE : SECURITY_STATES.UNAVAILABLE;

  return {
    provider: 'on-chain-inspection',
    verificationStatus: status,
    contractDeployed: inspection ? deployed : null,
    contractCodeLength: codeLength,
    tokenDecimals,
    upgradeability: 'unknown',
    ownership: 'unknown',
    pauseControl: 'unknown',
    notes,
    retrievedAt: new Date().toISOString(),
  };
}