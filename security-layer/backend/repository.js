import { query } from '../../backend/src/config/db.js';

const COLUMNS = `
  id, prepare_id AS "prepareId", opportunity_id AS "opportunityId", type, chain,
  chain_id AS "chainId", token_address AS "tokenAddress", token_decimals AS "tokenDecimals",
  vault_address AS "vaultAddress", strategy_address AS "strategyAddress",
  amount_raw AS "amountRaw", amount_human AS "amountHuman", spend_to AS "spendTo",
  status, tx_hash AS "txHash", block_number AS "blockNumber", gas_used AS "gasUsed",
  error_message AS "errorMessage", signed_at AS "signedAt", confirmed_at AS "confirmedAt",
  valid_until AS "validUntil", metadata, created_at AS "createdAt", updated_at AS "updatedAt"
`;

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    amountRaw: row.amountRaw,
    gasUsed: row.gasUsed,
    metadata: row.metadata || {},
  };
}

export async function insert(tx) {
  const result = await query(
    `INSERT INTO transactions (
       user_id, prepare_id, opportunity_id, type, chain, chain_id,
       token_address, token_decimals, vault_address, strategy_address,
       amount_raw, amount_human, spend_to, status, valid_until, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
     RETURNING ${COLUMNS}`,
    [
      tx.userId,
      tx.prepareId,
      tx.opportunityId ?? null,
      tx.type,
      tx.chain,
      tx.chainId,
      tx.tokenAddress,
      tx.tokenDecimals,
      tx.vaultAddress,
      tx.strategyAddress ?? null,
      tx.amountRaw,
      tx.amountHuman,
      tx.spendTo,
      tx.status,
      tx.validUntil ?? null,
      JSON.stringify(tx.metadata || {}),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function findByPrepareId(prepareId) {
  const result = await query(
    `SELECT ${COLUMNS} FROM transactions WHERE prepare_id = $1`,
    [prepareId],
  );
  return mapRow(result.rows[0] || null);
}

export async function findByTxHash(txHash) {
  const result = await query(
    `SELECT ${COLUMNS} FROM transactions WHERE tx_hash = $1`,
    [txHash.toLowerCase()],
  );
  return mapRow(result.rows[0] || null);
}

export async function updateByPrepareId(prepareId, patch) {
  const fields = [];
  const values = [];
  const bump = [];
  const allowed = {
    status: 'status',
    txHash: 'tx_hash',
    blockNumber: 'block_number',
    gasUsed: 'gas_used',
    errorMessage: 'error_message',
    signedAt: 'signed_at',
    confirmedAt: 'confirmed_at',
  };
  for (const [key, column] of Object.entries(allowed)) {
    if (patch[key] !== undefined) {
      values.push(patch[key]);
      fields.push(`${column} = $${values.length}`);
    }
  }
  if (!fields.length) return findByPrepareId(prepareId);
  values.push(prepareId);
  const result = await query(
    `UPDATE transactions
     SET ${fields.join(', ')}, updated_at = now()
     WHERE prepare_id = $${values.length}
     RETURNING ${COLUMNS}`,
    values,
  );
  return mapRow(result.rows[0] || null);
}

export async function findRecentByUser(userId, limit = 20) {
  const result = await query(
    `SELECT ${COLUMNS} FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map(mapRow);
}

export async function expireStale() {
  const result = await query(
    `UPDATE transactions SET status = 'expired', updated_at = now()
     WHERE status = 'prepared' AND valid_until < now()`,
  );
  return result.rowCount;
}