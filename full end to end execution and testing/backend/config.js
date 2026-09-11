// Phase 6: execution-readiness configuration.
//
// A thin overlay on top of the Phase 5 KeeperHub config. It answers the
// question the frontend must never lie about:
//
//     "Is this system genuinely ready to move value on-chain right now?"
//
// Every field is derived from real environment values read by the Phase 5
// config module. This module holds NO secrets — the API key is never read
// here, only the boolean "is it configured" flag released by Phase 5.

import { getConfig, resetConfig } from '../../keeper hub integration/backend/config.js';

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

let _overlay = null;

export function loadPhase6Config() {
  if (_overlay) return _overlay;

  const phase5 = getConfig();

  const executionRequired =
    envFlag('KEEPERHUB_EXECUTION_REQUIRED', false);

  const preflightFunding =
    envFlag('KEEPERHUB_PREFLIGHT_FUNDING', true);

  const minGasWei = BigInt(
    Math.max(0, Number(process.env.KEEPERHUB_MIN_GAS_WEI || '10000000000000000')),
  );

  _overlay = Object.freeze({
    // Direct execution (Phase 4) remains a first-class, real path. But when
    // the operator demands KeeperHub participation, we refuse to silently
    // settle for direct execution: Phase 5 reports executionMode 'blocked'.
    executionRequired,
    effectiveMode:
      phase5.executionMode === 'blocked'
        ? 'blocked'
        : phase5.executionMode,
    preflightFunding,
    minGasWei: minGasWei.toString(),
    pollMaxAttempts: phase5.pollMaxAttempts,
    pollIntervalMs: phase5.pollIntervalMs,
    chainsInScope: ['sepolia'],
    // Options used by the audit tooling (never secrets — presence only).
    hasDeploymentArtifactEnv:
      typeof process.env.GUARDIAN_CONTRACTS_DIR === 'string',
  });

  return _overlay;
}

export function getPhase6Config() {
  if (!_overlay) return loadPhase6Config();
  return _overlay;
}

export function resetPhase6Config() {
  _overlay = null;
  resetConfig();
}