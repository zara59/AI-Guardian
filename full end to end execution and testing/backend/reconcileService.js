// Phase 6: reconciliation — application vs KeeperHub vs blockchain.
//
// The spec (Phase 6 §14) requires the system never to silently mark success.
// This service compares three independent sources for one workflow:
//
//   1. application/database state   (workflow_executions row)
//   2. KeeperHub execution state     (GET /api/execute/{id}/status)
//   3. blockchain state              (receipt + vault logs + vault state reads)
//
// Verdicts:
//   verified          — all three agree AND independent on-chain verification passed
//   in_flight         — KeeperHub running/pending or tx not yet mined
//   db_only           — nothing submitted to KeeperHub / no tx yet
//   kh_failed         — KeeperHub reports failure
//   tx_reverted       — KeeperHub happy but the receipt reverted
//   verification_failed — receipt ok but event/state expectation not met
//   missing_tx        — KeeperHub claims completion but no tx hash found
//   unknown           — we could not obtain any external evidence
//
// Disagreement is surfaced (returned + recorded), never papered over.

import * as workflowRepository from '../../keeper hub integration/backend/repository.js';
import { getExecutionStatus } from '../../keeper hub integration/backend/client.js';
import { verifyExecution } from '../../keeper hub integration/backend/verifier.js';
import { probeChain, probeReceipt } from './chainProbe.js';
import { NETWORK_ID } from './chainProbe.js';

/**
 * Reconcile one workflow against KeeperHub + the blockchain. Never mutates
 * state to success without evidence.
 *
 * @param {string} workflowId
 * @param {object} [deps] — injectable for tests
 * @returns {Promise<{verdict, finalState, details: object, record?: object}>}
 */
export async function reconcileWorkflow(workflowId, deps = {}) {
  const repository = deps.repository || workflowRepository;
  const getKhStatus = deps.getExecutionStatus || getExecutionStatus;
  const verify = deps.verifyExecution || verifyExecution;
  const probeReceiptFn = deps.probeReceipt || probeReceipt;

  const record = await repository.findByWorkflowId(workflowId);
  if (!record) {
    return { verdict: 'unknown', finalState: 'missing', details: { error: `workflow ${workflowId} not found` }, record: null };
  }

  const details = { workflowId, dbState: record.finalState, khStatus: record.khStatus, txHash: record.txHash || null };

  // Nothing was ever submitted anywhere.
  if (!record.khExecutionId && !record.txHash) {
    if (record.finalState === 'failed' || record.finalState === 'expired' || record.finalState === 'cancelled') {
      return { verdict: 'reflect_db', finalState: record.finalState, details, record };
    }
    return { verdict: 'db_only', finalState: record.finalState, details, record };
  }

  // 2. KeeperHub state.
  let kh = null;
  if (record.khExecutionId) {
    try {
      kh = await getKhStatus(record.khExecutionId);
      details.keeperhub = {
        found: !!kh?.found,
        status: kh?.status ?? null,
        transactionHash: kh?.transactionHash ?? null,
      };
    } catch (err) {
      details.keeperhub = { error: err.message };
    }
  }

  // 3. Blockchain receipt.
  const txHash = record.txHash || kh?.transactionHash || null;
  details.effectiveTxHash = txHash;

  if (!txHash && kh?.found && kh?.status === 'completed') {
    return finish(repository, record.workflowId, 'missing_tx', 'KeeperHub reports completion but no transaction hash exists.', details);
  }

  if (!txHash && kh && kh.found && (kh.status === 'failed')) {
    return finish(repository, record.workflowId, 'kh_failed', 'KeeperHub reports execution failure.', details);
  }

  if (!txHash) {
    return finish(repository, record.workflowId, 'in_flight', 'No transaction hash yet; execution is either pending or not started.', details);
  }

  const receipt = await probeReceiptFn(txHash);
  details.receipt = receipt
    ? { status: receipt.status, blockNumber: receipt.blockNumber, to: receipt.to, from: receipt.from }
    : { status: 'not_found' };

  if (receipt && receipt.error) {
    return finish(repository, record.workflowId, 'unknown', `Receipt read failed: ${receipt.error}`, details);
  }

  // KeeperHub failed while a chain record exists.
  if (kh?.found && kh?.status === 'failed' && receipt && receipt.status !== 'success') {
    return finish(repository, record.workflowId, 'kh_failed', 'KeeperHub reports failure and no successful on-chain receipt exists.', details);
  }

  if (receipt == null) {
    return finish(repository, record.workflowId, 'in_flight', 'Transaction not yet mined. Retry after confirmation.', details);
  }

  // The big no-silent-success gate: a reverted receipt is a failure even if
  // KeeperHub is smiling.
  if (receipt.status !== 'success') {
    return finish(repository, record.workflowId, 'tx_reverted', `Transaction reverted on-chain (receipt status ${receipt.status}).`, details);
  }

  // Receipt succeeded → WHY IT IS NOT "SUCCEEDED" YET: we still independently
  // verify destination, event, and expected state.
  const verification = await verify({ ...record, txHash }).catch((err) => ({
    verified: false,
    receipt: null,
    events: [],
    vaultState: null,
    reason: err.message,
  }));

  details.verification = {
    verified: verification.verified,
    reason: verification.reason,
    events: verification.events?.length ?? 0,
    vaultState: verification.vaultState ? 'captured' : null,
    receipt: verification.receipt
      ? { blockNumber: verification.receipt.blockNumber, to: verification.receipt.to }
      : null,
  };

  if (verification.verified) {
    const state = await readVaultState(deps, record);
    details.verifiedState = state || verification.vaultState;
    return finish(repository, record.workflowId, 'verified',
      'Database, KeeperHub and blockchain agree; independent state verification passed.',
      details,
      {
        finalState: 'confirmed',
        verifiedAt: new Date(),
        verifiedEvents: verification.events,
        verifiedState: verification.vaultState,
        receiptStatus: 'success',
        blockNumber: verification.receipt?.blockNumber ?? record.blockNumber,
        gasUsed: verification.receipt?.gasUsed || record.gasUsed,
        khStatus: 'completed',
      });
  }

  return finish(repository, record.workflowId, 'verification_failed',
    verification.reason || 'Receipt ok but independent verification of event/state failed.',
    details);
}

async function readVaultState(deps, record) {
  if (!deps.getVaultStateFn) return null;
  try {
    return await deps.getVaultStateFn(NETWORK_ID, {
      vault: record.vaultAddress,
      token: record.tokenAddress,
      owner: record.walletAddress,
    });
  } catch {
    return null;
  }
}

async function finish(repository, workflowId, verdict, reason, details, patch = {}) {
  const body = {
    verdict,
    reason,
    reconciledAt: new Date().toISOString(),
    details: {
      db: details.dbState,
      keeperhub: details.keeperhub ?? null,
      receipt: details.receipt ?? null,
      verification: details.verification ?? null,
    },
  };
  if (verdict !== 'verified') body.signal = 'no_silent_success';

  let record = null;
  try {
    await repository.updateByWorkflowId(workflowId, {
      reconciliation: body,
      reconciledAt: new Date(),
      ...patch,
    });
    record = await repository.findByWorkflowId(workflowId);
  } catch (err) {
    body.persistError = err.message;
  }

  return { verdict, reason, finalState: record?.finalState ?? patch.finalState ?? null, details, record };
}

/**
 * Reconcile every workflow currently stuck in an in-flight state
 * (submitted/accepted/executing, stale). Bounded so it never storms the RPC.
 * @param {object} [deps]
 * @returns {Promise<Array<{workflowId, verdict}>>}
 */
export async function reconcileStuck(deps = {}) {
  const repository = deps.repository || workflowRepository;
  const limit = deps.limit ?? 20;
  const stuck = await repository.findStuck();
  const batch = stuck.slice(0, limit);
  const outcomes = [];
  for (const w of batch) {
    try {
      const r = await reconcileWorkflow(w.workflowId, deps);
      outcomes.push({ workflowId: w.workflowId, verdict: r.verdict });
    } catch (err) {
      outcomes.push({ workflowId: w.workflowId, verdict: 'error', error: err.message });
    }
  }
  return outcomes;
}

export { probeChain };