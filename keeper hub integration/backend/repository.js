// Phase 5: Workflow executions repository.
//
// PostgreSQL CRUD for the workflow_executions table. This is the durable
// source of truth for every KeeperHub execution lifecycle record.

import { query } from '../../backend/src/config/db.js';

const COLUMNS = `
  id, workflow_id AS "workflowId", approval_id AS "approvalId",
  opportunity_id AS "opportunityId", user_id AS "userId",
  wallet_address AS "walletAddress",
  chain_id AS "chainId", chain, token_address AS "tokenAddress",
  token_decimals AS "tokenDecimals", vault_address AS "vaultAddress",
  strategy_address AS "strategyAddress", operation, amount_raw AS "amountRaw",
  amount_human AS "amountHuman", workflow_hash AS "workflowHash",
  risk_score AS "riskScore", risk_classification AS "riskClassification",
  risk_gate_passed AS "riskGatePassed",
  approved, approved_at AS "approvedAt", expires_at AS "expiresAt",
  execution_mode AS "executionMode", idempotency_key AS "idempotencyKey",
  kh_execution_id AS "khExecutionId", kh_status AS "khStatus",
  tx_hash AS "txHash", block_number AS "blockNumber",
  gas_used AS "gasUsed", receipt_status AS "receiptStatus",
  sponsored, final_state AS "finalState", failure_reason AS "failureReason",
  verified_at AS "verifiedAt", verified_events AS "verifiedEvents",
  verified_state AS "verifiedState",
  reconciled_at AS "reconciledAt", reconciliation AS "reconciliation",
  funding_state AS "fundingState", funding_checked_at AS "fundingCheckedAt",
  metadata, created_at AS "createdAt", updated_at AS "updatedAt"
`;

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: row.metadata || {},
    verifiedEvents: row.verifiedEvents || null,
    verifiedState: row.verifiedState || null,
  };
}

export async function insert(workflow) {
  const result = await query(
    `INSERT INTO workflow_executions (
       workflow_id, approval_id, opportunity_id, user_id, wallet_address,
       chain_id, chain, token_address, token_decimals, vault_address,
       strategy_address, operation, amount_raw, amount_human, workflow_hash,
       risk_score, risk_classification, risk_gate_passed,
       approved, expires_at, execution_mode, final_state, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
     RETURNING ${COLUMNS}`,
    [
      workflow.workflowId,
      workflow.approvalId || null,
      workflow.opportunityId,
      workflow.userId,
      workflow.walletAddress,
      workflow.chainId,
      workflow.chain,
      workflow.tokenAddress,
      workflow.tokenDecimals,
      workflow.vaultAddress,
      workflow.strategyAddress || null,
      workflow.operation,
      workflow.amountRaw,
      workflow.amountHuman,
      workflow.workflowHash,
      workflow.riskScore || null,
      workflow.riskClassification || null,
      workflow.riskGatePassed || false,
      workflow.approved || false,
      workflow.expiresAt,
      workflow.executionMode || 'keeperhub',
      workflow.finalState || 'created',
      JSON.stringify(workflow.metadata || {}),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function findByWorkflowId(workflowId) {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions WHERE workflow_id = $1`,
    [workflowId],
  );
  return mapRow(result.rows[0] || null);
}

export async function findByApprovalId(approvalId) {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions WHERE approval_id = $1`,
    [approvalId],
  );
  return mapRow(result.rows[0] || null);
}

export async function findByKhExecutionId(khExecutionId) {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions WHERE kh_execution_id = $1`,
    [khExecutionId],
  );
  return mapRow(result.rows[0] || null);
}

export async function findByTxHash(txHash) {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions WHERE tx_hash = $1`,
    [txHash.toLowerCase()],
  );
  return mapRow(result.rows[0] || null);
}

export async function findRecentByUser(userId, limit = 20) {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(mapRow);
}

export async function findExpired() {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions
     WHERE final_state IN ('created', 'approved')
       AND expires_at < now()`,
  );
  return result.rows.map(mapRow);
}

export async function findStuck() {
  const result = await query(
    `SELECT ${COLUMNS} FROM workflow_executions
     WHERE final_state IN ('submitted', 'accepted', 'executing')
       AND updated_at < now() - interval '30 minutes'`,
  );
  return result.rows.map(mapRow);
}

export async function updateByWorkflowId(workflowId, patch) {
  const fields = [];
  const values = [];
  const allowed = {
    approvalId: 'approval_id',
    approved: 'approved',
    approvedAt: 'approved_at',
    executionMode: 'execution_mode',
    idempotencyKey: 'idempotency_key',
    khExecutionId: 'kh_execution_id',
    khStatus: 'kh_status',
    txHash: 'tx_hash',
    blockNumber: 'block_number',
    gasUsed: 'gas_used',
    receiptStatus: 'receipt_status',
    sponsored: 'sponsored',
    finalState: 'final_state',
    failureReason: 'failure_reason',
    verifiedAt: 'verified_at',
    verifiedEvents: 'verified_events',
    verifiedState: 'verified_state',
    reconciledAt: 'reconciled_at',
    reconciliation: 'reconciliation',
    fundingState: 'funding_state',
    fundingCheckedAt: 'funding_checked_at',
  };

  for (const [key, column] of Object.entries(allowed)) {
    if (patch[key] !== undefined) {
      values.push(
        (key === 'verifiedEvents' || key === 'verifiedState' || key === 'reconciliation')
          ? JSON.stringify(patch[key])
          : patch[key],
      );
      fields.push(`${column} = $${values.length}`);
    }
  }

  if (!fields.length) return findByWorkflowId(workflowId);

  values.push(workflowId);
  const result = await query(
    `UPDATE workflow_executions
     SET ${fields.join(', ')}, updated_at = now()
     WHERE workflow_id = $${values.length}
     RETURNING ${COLUMNS}`,
    values,
  );
  return mapRow(result.rows[0] || null);
}

/**
 * Compare-and-swap: atomically move a workflow from APPROVED to SUBMITTED —
 * ONLY if it is still unsubmitted. Race-safe replay protection so two
 * requests (double-click, duplicate API call) cannot both broadcast.
 * @returns {Promise<object|null>} updated row, or null if already moving
 */
export async function tryMarkSubmitting(workflowId) {
  const result = await query(
    `UPDATE workflow_executions
     SET final_state = 'submitted', updated_at = now()
     WHERE workflow_id = $1 AND approved = true AND final_state = 'approved'
     RETURNING ${COLUMNS}`,
    [workflowId],
  );
  return mapRow(result.rows[0] || null);
}
