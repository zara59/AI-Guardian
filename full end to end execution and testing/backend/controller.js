// Phase 6: readiness/funding/reconciliation/state controllers.
//
// Read-only diagnostics + explicit reconciliation triggers. These endpoints
// tell the UI the REAL state of the world: whether contracts are deployed,
// whether the KeeperHub key authenticates, whether the execution wallet is
// funded, and what the Phase 6 state machine derives for a workflow.

import { checkReadiness } from './readiness.js';
import { checkExecutionFunding } from './funding.js';
import { probeVaultState } from './chainProbe.js';
import { loadSepoliaContracts } from './deploymentCheck.js';
import { reconcileWorkflow, reconcileStuck } from './reconcileService.js';
import { runSecurityAudit } from './guards.js';
import { derivePhase6State, STATE, STATE_LABELS, pipelineTrace } from './stateMachine.js';
import * as workflowRepository from '../../keeper hub integration/backend/repository.js';
import asyncHandler from '../../backend/src/utils/asyncHandler.js';
import { ok } from '../../backend/src/utils/response.js';

/** GET /api/phase6/readiness — is the system genuinely ready? */
export const readiness = asyncHandler(async (req, res) => {
  const report = await checkReadiness();
  return ok(res, { status: report.ready ? 'ready' : 'not_ready', ...report });
});

/** GET /api/phase6/funding — real execution-wallet balance/allocation. */
export const funding = asyncHandler(async (req, res) => {
  const { operation, amountRaw, walletAddress, tokenAddress, vaultAddress } = req.query || {};
  const funding = await checkExecutionFunding({
    operation: operation || 'deposit',
    amountRaw: amountRaw || undefined,
    walletAddress: walletAddress || undefined,
    tokenAddress: tokenAddress || undefined,
    vaultAddress: vaultAddress || undefined,
  });
  return ok(res, { status: funding.state, ...funding });
});

/** POST /api/phase6/reconcile/:workflowId — three-way reconciliation. */
export const reconcile = asyncHandler(async (req, res) => {
  const result = await reconcileWorkflow(req.params.workflowId);
  return ok(res, {
    status: result.verdict,
    verdict: result.verdict,
    finalState: result.finalState,
    reason: result.reason,
    details: result.details,
  });
});

/** POST /api/phase6/reconcile/stuck — sweep stale in-flight workflows. */
export const reconcileStuckBatch = asyncHandler(async (req, res) => {
  const outcomes = await reconcileStuck();
  return ok(res, { reconciled: outcomes.length, outcomes });
});

/** GET /api/phase6/vault-state — real GuardianVault reads for before/after. */
export const vaultState = asyncHandler(async (req, res) => {
  const { owner } = req.query || {};
  const contracts = await loadSepoliaContracts();
  if (!contracts) {
    const err = new Error('No Sepolia deployment artifact; cannot read vault state.');
    err.status = 503;
    throw err;
  }
  const state = await probeVaultState({
    vault: contracts.vault.address,
    token: contracts.token.address,
    owner,
  });
  return ok(res, {
    vault: contracts.vault.address,
    token: contracts.token.address,
    owner: owner ? String(owner).toLowerCase() : null,
    state,
  });
});

/** GET /api/phase6/state/:workflowId — Phase 6 derived state. */
export const workflowState = asyncHandler(async (req, res) => {
  const record = await workflowRepository.findByWorkflowId(req.params.workflowId);
  if (!record) {
    const err = new Error(`workflow ${req.params.workflowId} not found`);
    err.status = 404;
    throw err;
  }
  const derived = derivePhase6State(record);
  return ok(res, { workflowId: record.workflowId, ...derived, trace: pipelineTrace({ workflow: record }) });
});

/** GET /api/phase6/states — the state-machine vocabulary for UIs. */
export const states = asyncHandler(async (req, res) => {
  return ok(res, { states: STATE, labels: STATE_LABELS });
});

/** GET /api/phase6/audit — security audit snapshot. */
export const audit = asyncHandler(async (req, res) => {
  const report = await runSecurityAudit();
  return ok(res, { status: 'ok', ...report });
});