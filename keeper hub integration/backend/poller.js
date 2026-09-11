// Phase 5: KeeperHub execution poller.
//
// Polls KeeperHub for execution status with bounded backoff.
// Honors the X-Poll-Interval-Hint response header (KeeperHub's recommended
// interval). Never queries forever — after the max attempts, marks the
// execution as requiring reconciliation instead of faking success/failure.

import { keeperHubAdapter } from './keeperhubAdapter.js';
import * as repository from './repository.js';
import { verifyExecution } from './verifier.js';
import { getConfig } from './config.js';
import { sleep } from './sleep.js';

/**
 * Map KeeperHub status strings to our final_state values.
 */
export function mapKhStatus(khStatus) {
  const mapping = {
    pending: 'submitted',
    running: 'executing',
    unconfirmed: 'accepted',
    completed: 'confirmed',
    failed: 'failed',
  };
  return mapping[khStatus] || khStatus || 'executing';
}

/**
 * Poll a KeeperHub execution until it reaches a terminal state.
 * @param {string} workflowId
 * @param {object} [options]
 * @param {number} [options.maxAttempts]
 * @param {number} [options.pollIntervalMs]
 * @param {object} [deps] — injectable dependencies for testing
 * @returns {Promise<object>} final workflow record
 */
export async function pollExecutionStatus(workflowId, options = {}, deps = {}) {
  const {
    getStatusFn = keeperHubAdapter.getStatus,
    repositoryApi = repository,
    verifyFn = verifyExecution,
    sleepFn = sleep,
  } = deps;
  const config = getConfig();

  const maxAttempts = options.maxAttempts ?? config.pollMaxAttempts;
  const baseInterval = options.pollIntervalMs ?? config.pollIntervalMs;

  let workflow = await repositoryApi.findByWorkflowId(workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  if (!workflow.khExecutionId) {
    throw new Error(`Workflow ${workflowId} has no KeeperHub execution ID`);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await getStatusFn(workflow.khExecutionId);

    if (status.found) {
      await repositoryApi.updateByWorkflowId(workflowId, {
        khStatus: status.status,
        txHash: status.transactionHash?.toLowerCase() || workflow.txHash,
        sponsored: status.sponsored ?? workflow.sponsored,
        finalState: status.status === 'completed' ? 'executing' : mapKhStatus(status.status),
      });
      workflow = await repositoryApi.findByWorkflowId(workflowId);
    }

    const pollHint = typeof status.pollIntervalHint === 'number' ? status.pollIntervalHint : null;
    const waitMs = pollHint !== null ? pollHint * 1000 : baseInterval;

    // KeeperHub said 0 → terminal state reached.
    if (pollHint === 0) {
      return await finalizeStatus(workflow, status, repositoryApi, verifyFn);
    }

    if (status.status === 'completed') {
      return await finalizeStatus(workflow, status, repositoryApi, verifyFn);
    }

    if (status.status === 'failed') {
      await repositoryApi.updateByWorkflowId(workflowId, {
        khStatus: 'failed',
        finalState: 'failed',
        failureReason: status.error || 'KeeperHub reported execution failure',
      });
      return await repositoryApi.findByWorkflowId(workflowId);
    }

    if (attempt < maxAttempts) {
      await sleepFn(waitMs);
    }
  }

  // Ran out of attempts — not a terminal failure; the transaction may still
  // land. Mark as requiring reconciliation so it is not lost.
  await repositoryApi.updateByWorkflowId(workflowId, {
    finalState: 'accepted',
    failureReason: 'Execution submitted but status could not be confirmed within polling budget. Reconciliation required.',
  });
  return await repositoryApi.findByWorkflowId(workflowId);
}

/**
 * Finalize a successful execution: verify on-chain and record state.
 */
async function finalizeStatus(workflow, status, repositoryApi, verifyFn) {
  const txHash = (status.transactionHash || workflow.txHash)?.toLowerCase();
  await repositoryApi.updateByWorkflowId(workflow.workflowId, {
    khStatus: 'completed',
    txHash: txHash || null,
    finalState: 'confirmed',
    receiptStatus: txHash ? 'pending_verify' : 'none',
  });

  workflow = await repositoryApi.findByWorkflowId(workflow.workflowId);

  if (!txHash) {
    await repositoryApi.updateByWorkflowId(workflow.workflowId, {
      finalState: 'failed',
      failureReason: 'KeeperHub reported completion but no transaction hash was provided',
    });
    return await repositoryApi.findByWorkflowId(workflow.workflowId);
  }

  // Independent blockchain verification.
  const verification = await verifyFn(workflow).catch((err) => ({
    verified: false,
    reason: `Verification threw: ${err.message}`,
  }));

  if (verification.verified) {
    await repositoryApi.updateByWorkflowId(workflow.workflowId, {
      verifiedAt: new Date(),
      verifiedEvents: verification.events,
      verifiedState: verification.vaultState,
      receiptStatus: 'success',
      blockNumber: verification.receipt?.blockNumber ?? null,
      gasUsed: verification.receipt?.gasUsed || null,
      finalState: 'confirmed',
    });
  } else {
    await repositoryApi.updateByWorkflowId(workflow.workflowId, {
      finalState: 'failed',
      failureReason: verification.reason || 'Blockchain verification failed',
      receiptStatus: 'failed',
    });
  }

  return await repositoryApi.findByWorkflowId(workflow.workflowId);
}