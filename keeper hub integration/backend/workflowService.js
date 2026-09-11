// Phase 5: KeeperHub workflow service.
//
// The core Phase 5 business logic:
//
//  recommendation  — AI Guardian scores/ranks the opportunity (exists already)
//  preparation     — this service builds the EXACT deterministic workflow
//  authorization   — the user explicitly approves the workflow
//  execution       — KeeperHub executes the approved workflow
//  settlement      — the blockchain records the final state
//
// Rules enforced here:
//   - No arbitrary targets/calldata — everything comes from the contract
//     registry, never from the client.
//   - Workflows are immutable after approval — any field change breaks the
//     hash and requires a new approval.
//   - Duplicate execution is prevented by a deterministic idempotency key
//     derived from the workflow hash.
//   - The user must explicitly approve before anything is sent to KeeperHub.

import crypto from 'node:crypto';
import { getConfig } from './config.js';
import * as repository from './repository.js';
import * as opportunityRepository from '../../backend/src/repositories/opportunityRepository.js';
import * as activityRepository from '../../backend/src/repositories/activityRepository.js';
import { getUserRepositoryContext } from '../../backend/src/services/userHelper.js';
import { getGuardianContracts } from '../../security-layer/backend/registry.js';
import { getNetwork, isAddress } from '../../backend/src/config/networks.js';
import { toRaw } from '../../security-layer/backend/amounts.js';
import { ApiError } from '../../backend/src/utils/response.js';
import { keeperHubAdapter } from './keeperhubAdapter.js';
import { directAdapter } from './directAdapter.js';

// Non-terminal states that must block a new execution of the same workflow.
const ACTIVE_STATES = new Set(['created', 'approved', 'submitted', 'accepted', 'executing']);

const VALID_OPERATIONS = new Set(['deposit', 'withdraw', 'approve']);
const TOKEN_SYMBOL = 'gTEST';

// Workflow lifetime in milliseconds (24 hours is generous for a demo).
const WORKFLOW_VALID_MS = 24 * 60 * 60 * 1000;

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

/**
 * Deterministic canonical serialization of a workflow for hashing.
 * Field order is fixed; separators are unambiguous.
 * @param {object} w
 * @returns {string}
 */
export function canonicalWorkflowString(w) {
  return [
    String(w.chainId || 11155111),
    String(w.tokenAddress || '').toLowerCase(),
    String(w.tokenDecimals ?? 6),
    String(w.vaultAddress || '').toLowerCase(),
    String(w.strategyAddress || '').toLowerCase(),
    String(w.operation || ''),
    String(w.amountRaw || ''),
    String(w.opportunityId || 0),
    String(w.walletAddress || '').toLowerCase(),
  ].join('|');
}

/**
 * Compute the SHA-256 workflow hash (lowercase hex).
 * Used to verify that what the user approved == what KeeperHub received.
 * @param {object} workflow
 * @returns {string}
 */
export function workflowHashOf(workflow) {
  return crypto.createHash('sha256').update(canonicalWorkflowString(workflow)).digest('hex');
}

function opportunityScoreOf(opp) {
  const parts = [
    opp.smartContractSecurity, opp.protocolHistory, opp.liquidityStability,
    opp.contractPermissions, opp.exploitIndicators, opp.currentYield,
    opp.historicalSustainability, opp.incentives, opp.opportunitySize,
    opp.marketConditions, opp.businessModel, opp.rewardSustainability,
    opp.protocolActivity, opp.availableLiquidity, opp.withdrawalConditions,
    opp.minimumCapital, opp.riskPreferenceFit, opp.complexity, opp.timeCommitment,
  ];
  return Math.round(parts.reduce((a, b) => a + Number(b || 0), 0));
}

/**
 * Risk gate — mirrors the Phase 4 gate. Executions are blocked outright for
 * opportunities flagged high-risk, avoid, or insufficient-data.
 * @throws {ApiError} with code RISK_GATE
 */
function riskGate({ opportunity }) {
  const reasons = [];
  if (opportunity.eligibility === 'insufficient-data') {
    reasons.push('Guardian does not have enough verified data about this opportunity');
  }
  if (opportunity.eligibility === 'avoid') {
    reasons.push('This opportunity is flagged with a hard blocker');
  }
  if (opportunity.risk === 'high') {
    reasons.push('High-risk opportunities require manual review');
  }
  if (reasons.length) {
    throw new ApiError(409, reasons.join('; '), 'RISK_GATE');
  }
}

/**
 * Bounded (not reckless) retry for the initial KeeperHub submit — handles
 * transient network failures without resubmitting a broadcast tx.
 */
async function withBoundedRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** i));
      }
    }
  }
  throw lastError;
}

function buildDeps(overrides = {}) {
  return {
    repository,
    opportunityRepository,
    activityRepository,
    getUserRepositoryContext,
    getGuardianContracts,
    getNetwork,
    keeperHubAdapter,
    directAdapter,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a deterministic workflow for an opportunity.
 * Server-side derivation only: target contract, amounts, and operation come
 * from the registry — never from raw client input.
 *
 * @param {object} payload { opportunityId, walletAddress, amount, type }
 * @param {object} [overrides] — test seam
 * @returns {Promise<object>} workflow for user review + the record
 */
export async function createWorkflow(payload, overrides = {}) {
  const deps = buildDeps(overrides);
  const { opportunityId, walletAddress, amount, type = 'deposit' } = payload;

  if (!isAddress(walletAddress)) {
    throw new ApiError(400, 'walletAddress must be a valid address', 'INVALID_WALLET');
  }
  if (!VALID_OPERATIONS.has(type)) {
    throw new ApiError(400, 'type must be one of deposit, withdraw, approve', 'INVALID_TYPE');
  }
  if (typeof amount !== 'string' && typeof amount !== 'number') {
    throw new ApiError(400, 'amount is required', 'INVALID_AMOUNT');
  }

  const user = await deps.getUserRepositoryContext();
  const opportunity = await deps.opportunityRepository.findById(opportunityId);
  if (!opportunity) {
    throw new ApiError(404, `opportunity ${opportunityId} not found`, 'NOT_FOUND');
  }

  // Risk gate before a workflow can even exist.
  riskGate({ opportunity });

  // Contract deployment + network must exist for the opportunity chain.
  const chainId = Number(opportunity.chainId || 11155111);
  const contracts = await deps.getGuardianContracts(chainId);
  if (!contracts) {
    throw new ApiError(
      503,
      `No Guardian contract deployment on chain ${chainId}. Workflow cannot be prepared.`,
      'NOT_DEPLOYED',
    );
  }

  const network = await deps.getNetwork(opportunity.chain?.toLowerCase() || 'sepolia');
  if (!network) {
    throw new ApiError(503, `network for chain ${chainId} is not configured`, 'UNKNOWN_NETWORK');
  }

  const { token, strategy, vault } = contracts;
  if (!token || !vault) {
    throw new ApiError(503, 'Guardian deployment missing token/vault contracts', 'NOT_DEPLOYED');
  }

  // Real on-chain decimals.
  const decimals = token.decimals;
  let rawAmount;
  try {
    rawAmount = toRaw(String(amount), decimals);
  } catch {
    throw new ApiError(400, `amount must be a positive number with at most ${decimals} decimals`, 'INVALID_AMOUNT');
  }
  if (rawAmount <= 0n) {
    throw new ApiError(400, 'amount must be positive', 'INVALID_AMOUNT');
  }

  const config = getConfig();

  // Phase 6 policy: when KeeperHub execution is REQUIRED but no key exists,
  // refuse to prepare rather than silently fall back to direct execution.
  if (config.executionMode === 'blocked') {
    throw new ApiError(
      503,
      'KeeperHub execution is required (KEEPERHUB_EXECUTION_REQUIRED=true) but KEEPERHUB_API_KEY is not configured. Set the key, or disable the requirement.',
      'KEEPERHUB_CONFIG_REQUIRED',
    );
  }

  const workflow = {
    opportunityId: opportunity.id,
    opportunitySlug: opportunity.slug,
    opportunityName: opportunity.name,
    chainId: Number(network.chainId),
    chain: network.id,
    tokenAddress: token.address,
    tokenDecimals: decimals,
    vaultAddress: vault.address,
    strategyAddress: strategy ? strategy.address : null,
    operation: type,
    amountRaw: rawAmount.toString(),
    amountHuman: String(amount),
    walletAddress: walletAddress.toLowerCase(),
    walletValid: isAddress(walletAddress),
    riskScore: opportunityScoreOf(opportunity),
    riskClassification: opportunity.risk,
    riskGatePassed: true,
    eligibility: opportunity.eligibility,
    dataConfidence: opportunity.dataConfidence,
    lastUpdated: opportunity.lastUpdated,
    tvlUsd: opportunity.tvlUsd,
    apy: opportunity.apy,
    protocol: opportunity.protocol,
    category: opportunity.category,
    executionMode: config.executionMode,
    expiresAt: new Date(Date.now() + WORKFLOW_VALID_MS),
  };

  // Deterministic workflow ID + integrity hash.
  workflow.workflowId = hashId(['guardian-kh', workflow.opportunityId, workflow.walletAddress, workflow.operation, workflow.amountRaw, workflow.chainId]);
  workflow.workflowHash = workflowHashOf(workflow);

  const record = await deps.repository.insert({
    ...workflow,
    userId: user.id,
    executionMode: config.executionMode,
    finalState: 'created',
    metadata: {
      opportunitySlug: opportunity.slug,
      opportunityName: opportunity.name,
      protocol: opportunity.protocol,
      category: opportunity.category,
      tvlUsd: opportunity.tvlUsd?.toString?.() || null,
      apy: opportunity.apy?.toString?.() || null,
      dataConfidence: opportunity.dataConfidence,
      lastUpdated: opportunity.lastUpdated,
    },
  });

  await deps.activityRepository.insert({
    userId: user.id,
    type: 'keeperhub',
    title: `Workflow prepared · ${type}`,
    description: `${type} of ${workflow.amountHuman} ${TOKEN_SYMBOL} via GuardianVault (awaiting approval)`,
    metadata: {
      workflowId: workflow.workflowId,
      workflowHash: workflow.workflowHash,
      chainId: workflow.chainId,
      operation: workflow.operation,
      executionMode: config.executionMode,
    },
  });

  return serializeWorkflow(record);
}

/**
 * User explicitly approves a prepared workflow.
 * All integrity checks run BEFORE the approval is recorded.
 *
 * @param {string} workflowId
 * @param {object} [overrides]
 * @returns {Promise<object>} approval record
 */
export async function approveWorkflow(workflowId, overrides = {}) {
  const deps = buildDeps(overrides);
  const user = await deps.getUserRepositoryContext();

  const record = await deps.repository.findByWorkflowId(workflowId);
  if (!record) {
    throw new ApiError(404, `workflow ${workflowId} not found`, 'NOT_FOUND');
  }
  if (record.userId !== user.id) {
    throw new ApiError(403, 'workflow belongs to another user', 'FORBIDDEN');
  }
  if (record.approved) {
    throw new ApiError(409, 'workflow already approved', 'ALREADY_APPROVED');
  }
  if (ACTIVE_STATES.has(record.finalState) && record.finalState !== 'created') {
    throw new ApiError(409, 'workflow is already in progress', 'IN_PROGRESS');
  }
  if (record.finalState === 'confirmed' || record.finalState === 'failed') {
    throw new ApiError(409, 'workflow already reached a terminal state', 'TERMINAL');
  }
  if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
    throw new ApiError(409, 'workflow has expired; review a fresh one', 'EXPIRED');
  }

  // Integrity: the stored hash must still match the current workflow values.
  const rehash = workflowHashOf(record);
  if (rehash !== record.workflowHash) {
    throw new ApiError(409, 'workflow integrity check failed — parameters changed after preparation', 'INTEGRITY');
  }

  const approvalId = hashId(['approval', record.workflowId, record.workflowHash, Date.now()]);

  const updated = await deps.repository.updateByWorkflowId(workflowId, {
    approved: true,
    approvalId,
    approvedAt: new Date(),
    finalState: 'approved',
  });

  await deps.activityRepository.insert({
    userId: user.id,
    type: 'keeperhub',
    title: 'Workflow approved',
    description: `Approved ${updated.operation} of ${updated.amountHuman} ${TOKEN_SYMBOL} · workflow hash ${updated.workflowHash.slice(0, 12)}…`,
    metadata: { workflowId, approvalId, workflowHash: updated.workflowHash },
  });

  return serializeWorkflow(updated);
}

/**
 * Submit an APPROVED workflow to KeeperHub for execution.
 *
 * Hard checks before anything reaches KeeperHub:
 *   1. workflow exists
 *   2. workflow is approved
 *   3. workflow belongs to the correct user
 *   4. workflow has not expired
 *   5. workflow has not already executed
 *   6. workflow hash is still valid
 *   7. network still configured
 *   8. contract still deployed
 *
 * @param {string} approvalId
 * @param {object} [overrides]
 * @returns {Promise<object>} execution record with kh_execution_id
 */
export async function executeWorkflow(approvalId, overrides = {}) {
  const deps = buildDeps(overrides);
  const user = await deps.getUserRepositoryContext();
  const config = getConfig();

  // 1. Locate by approval ID.
  const record = await deps.repository.findByApprovalId(approvalId);
  if (!record) {
    throw new ApiError(404, `approval ${approvalId} not found`, 'NOT_FOUND');
  }

  // 2 + 3. Ownership + approval.
  if (record.userId !== user.id) {
    throw new ApiError(403, 'workflow belongs to another user', 'FORBIDDEN');
  }
  if (!record.approved) {
    throw new ApiError(409, 'workflow has not been approved by the user', 'NOT_APPROVED');
  }

  // 4. Expiry.
  if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
    throw new ApiError(409, 'workflow has expired; review a fresh one', 'EXPIRED');
  }

  // 5. Already executing / executed → no duplicates.
  if (ACTIVE_STATES.has(record.finalState) && record.finalState !== 'approved') {
    throw new ApiError(409, 'workflow already submitted for execution', 'DUPLICATE');
  }
  if (record.finalState === 'confirmed') {
    throw new ApiError(409, 'workflow already executed successfully', 'DUPLICATE');
  }
  if (record.finalState === 'failed') {
    throw new ApiError(409, 'workflow previously failed; create a new one after review', 'DUPLICATE');
  }

  // 6. Integrity — approve-time hash must match the stored workflow.
  const rehash = workflowHashOf(record);
  if (rehash !== record.workflowHash) {
    throw new ApiError(409, 'workflow integrity check failed — parameters changed after approval', 'INTEGRITY');
  }

  // 7 + 8. Network + contract still valid.
  const contracts = await deps.getGuardianContracts(record.chainId);
  if (!contracts) {
    throw new ApiError(503, `Guardian contracts no longer deployed on chain ${record.chainId}`, 'NOT_DEPLOYED');
  }
  const network = await deps.getNetwork(record.chain);
  if (!network) {
    throw new ApiError(503, `network ${record.chain} is no longer configured`, 'UNKNOWN_NETWORK');
  }

  // Phase 6: no silent fallback to a non-KeeperHub path when execution is
  // required but this record was prepared under a different mode.
  if (config.executionRequired && record.executionMode !== 'keeperhub') {
    throw new ApiError(
      503,
      'KeeperHub execution is required, but this workflow targets direct execution. Prepare a new workflow with a configured KeeperHub key.',
      'KEEPERHUB_CONFIG_REQUIRED',
    );
  }

  // Choose adapter by execution mode.
  const adapter = record.executionMode === 'direct' ? deps.directAdapter : deps.keeperHubAdapter;

  const workflowForAdapter = {
    ...record,
    operation: record.operation,
  };

  // Idempotency key: deterministic from workflow identity — the same work
  // always produces the same key, so a retry cannot double-execute.
  const idempotencyKey = hashId(['guardian-kh', record.workflowHash]);

  // Phase 6 replay protection: cross-process lock + durable compare-and-swap.
  const { acquireExecutionLock, releaseExecutionLock } = await import(
    '../../full end to end execution and testing/backend/lock.js'
  );
  const acquired = await acquireExecutionLock(record.workflowId);
  if (!acquired.ok) {
    throw new ApiError(409, 'This workflow is already being submitted by another request.', 'DUPLICATE');
  }

  try {
    // CAS: only an approved, not-yet-submitted workflow may become 'submitted'.
    let cas = record;
    if (typeof deps.repository.tryMarkSubmitting === 'function') {
      cas = await deps.repository.tryMarkSubmitting(record.workflowId);
    } else {
      await deps.repository.updateByWorkflowId(record.workflowId, {
        idempotencyKey,
        khStatus: 'submitting',
        finalState: 'submitted',
      });
    }
    if (cas === null) {
      throw new ApiError(409, 'This workflow was already submitted — a duplicate request raced ahead.', 'DUPLICATE');
    }
    await deps.repository.updateByWorkflowId(record.workflowId, {
      idempotencyKey,
      khStatus: 'submitting',
    });

    // Phase 6 funding gate — never broadcast when the execution wallet cannot
    // provably afford the operation. Real on-chain reads. Enabled by the
    // controller via KEEPERHUB_PREFLIGHT_FUNDING.
    if (overrides.preflightFunding === true && record.executionMode === 'keeperhub') {
      const { checkExecutionFunding } = await import(
        '../../full end to end execution and testing/backend/funding.js'
      );
      const gate = await checkExecutionFunding({
        operation: record.operation,
        amountRaw: record.amountRaw,
        tokenAddress: record.tokenAddress,
        vaultAddress: record.vaultAddress,
        ownerAddress: record.walletAddress,
      });
      await deps.repository.updateByWorkflowId(record.workflowId, {
        fundingState: gate.state,
        fundingCheckedAt: new Date(),
      });
      if (!gate.ready) {
        await deps.repository.updateByWorkflowId(record.workflowId, {
          finalState: 'failed',
          failureReason: `Funding gate blocked execution: ${gate.detail}`,
        });
        throw new ApiError(409, gate.detail, 'INSUFFICIENT_FUNDS');
      }
    }

    // Pre-flight: simulate via KeeperHub when configured.
    if (config.simulateFirst && record.executionMode !== 'direct') {
      const simulation = await withBoundedRetry(() => adapter.simulate(workflowForAdapter));
      if (!simulation.success || simulation.wouldRevert) {
        await deps.repository.updateByWorkflowId(record.workflowId, {
          finalState: 'failed',
          failureReason: `Simulation failed: ${simulation.error || 'call would revert'}`,
          khStatus: 'simulation_failed',
        });
        throw new ApiError(409, `Pre-flight simulation failed: ${simulation.error || 'call would revert'}`, 'SIMULATION_FAILED');
      }
    }

    // Broadcast through the adapter (KeeperHub or direct).
    const result = await withBoundedRetry(() =>
      adapter.execute(workflowForAdapter, idempotencyKey),
    );

    if (result.conflict) {
      // 409 idempotency conflict — the SAME work is already in flight.
      await deps.repository.updateByWorkflowId(record.workflowId, {
        khStatus: 'idempotency_conflict',
        finalState: 'accepted',
        failureReason: null,
      });
      // Recover the original execution ID if provided.
      if (result.originalExecutionId) {
        await deps.repository.updateByWorkflowId(record.workflowId, {
          khExecutionId: result.originalExecutionId,
        });
      }
      return serializeWorkflow(await deps.repository.findByWorkflowId(record.workflowId));
    }

    if (!result.success) {
      await deps.repository.updateByWorkflowId(record.workflowId, {
        finalState: 'failed',
        failureReason: result.error || 'KeeperHub execution failed',
        khStatus: 'failed',
      });
      throw new ApiError(502, result.error || 'KeeperHub execution failed', 'EXECUTION_FAILED');
    }

    // Persist the KeeperHub execution ID.
    await deps.repository.updateByWorkflowId(record.workflowId, {
      khExecutionId: result.executionId || null,
      khStatus: result.status || 'submitted',
      txHash: result.transactionHash?.toLowerCase() || record.txHash,
      sponsored: result.sponsored ?? false,
      finalState: result.status === 'completed' ? 'confirmed' : 'submitted',
    });

    await deps.activityRepository.insert({
      userId: user.id,
      type: 'keeperhub',
      title: 'Workflow submitted to KeeperHub',
      description: `Submitted to KeeperHub (${adapter.getName()}) · execution ${result.executionId || 'pending'}`,
      metadata: {
        workflowId: record.workflowId,
        approvalId,
        executionId: result.executionId,
        txHash: result.transactionHash?.toLowerCase() || null,
        finalState: 'submitted',
      },
    });

    return serializeWorkflow(await deps.repository.findByWorkflowId(record.workflowId));
  } finally {
    await releaseExecutionLock(record.workflowId);
  }
}

/**
 * Get current status of a workflow.
 * @param {string} workflowId
 * @param {object} [overrides]
 * @returns {Promise<object>}
 */
export async function getWorkflowStatus(workflowId, overrides = {}) {
  const deps = buildDeps(overrides);
  const record = await deps.repository.findByWorkflowId(workflowId);
  if (!record) {
    throw new ApiError(404, `workflow ${workflowId} not found`, 'NOT_FOUND');
  }
  return serializeWorkflow(record);
}

/**
 * List recent workflows for the current user.
 * @param {number} limit
 * @param {object} [overrides]
 * @returns {Promise<Array>}
 */
export async function listWorkflowsForUser(limit = 20, overrides = {}) {
  const deps = buildDeps(overrides);
  const user = await deps.getUserRepositoryContext();
  const items = await deps.repository.findRecentByUser(user.id, limit);
  return items.map(serializeWorkflow);
}

/**
 * Manually trigger reconciliation / verification for a workflow.
 * @param {string} workflowId
 * @param {object} [overrides]
 * @returns {Promise<object>}
 */
export async function reconcileWorkflow(workflowId, overrides = {}) {
  const deps = buildDeps(overrides);
  const record = await deps.repository.findByWorkflowId(workflowId);
  if (!record) {
    throw new ApiError(404, `workflow ${workflowId} not found`, 'NOT_FOUND');
  }
  if (!record.txHash) {
    throw new ApiError(409, 'no transaction hash available to reconcile', 'NO_TX');
  }

  const { verifyExecution } = await import('./verifier.js');
  const verification = await verifyExecution(record).catch((err) => ({
    verified: false,
    reason: err.message,
  }));

  await deps.repository.updateByWorkflowId(workflowId, {
    verifiedAt: verification.verified ? new Date() : record.verifiedAt,
    verifiedEvents: verification.events || null,
    verifiedState: verification.vaultState || null,
    receiptStatus: verification.verified ? 'success' : record.receiptStatus,
    finalState: verification.verified ? 'confirmed' : record.finalState,
    failureReason: verification.verified ? null : (verification.reason || record.failureReason),
  });

  return {
    ...serializeWorkflow(await deps.repository.findByWorkflowId(workflowId)),
    reconciliation: {
      verified: verification.verified,
      reason: verification.reason,
    },
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeWorkflow(record) {
  if (!record) return null;
  return {
    id: record.id,
    workflowId: record.workflowId,
    approvalId: record.approvalId,
    opportunityId: record.opportunityId,
    opportunityName: record.metadata?.opportunityName || record.opportunityId,
    opportunitySlug: record.metadata?.opportunitySlug || null,
    chainId: record.chainId,
    chain: record.chain,
    token: { address: record.tokenAddress, decimals: record.tokenDecimals, symbol: TOKEN_SYMBOL },
    vault: { address: record.vaultAddress },
    strategy: record.strategyAddress ? { address: record.strategyAddress } : null,
    operation: record.operation,
    amount: { raw: record.amountRaw, human: record.amountHuman },
    walletAddress: record.walletAddress,
    workflowHash: record.workflowHash,
    riskScore: record.riskScore,
    riskClassification: record.riskClassification,
    riskGatePassed: record.riskGatePassed,
    approved: record.approved,
    approvedAt: record.approvedAt,
    expiresAt: record.expiresAt,
    executionMode: record.executionMode,
    idempotencyKey: record.idempotencyKey,
    khExecutionId: record.khExecutionId,
    khStatus: record.khStatus,
    txHash: record.txHash,
    blockNumber: record.blockNumber,
    gasUsed: record.gasUsed,
    receiptStatus: record.receiptStatus,
    sponsored: record.sponsored,
    finalState: record.finalState,
    failureReason: record.failureReason,
    verifiedAt: record.verifiedAt,
    verifiedEvents: record.verifiedEvents,
    verifiedState: record.verifiedState,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}