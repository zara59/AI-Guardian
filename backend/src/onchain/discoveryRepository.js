// Persistence for the on-chain opportunity discovery pipeline.
// - discovery_state: per-chain cursor (last scanned block) so the event scan
//   is incremental and restart-safe.
// - opportunity_share_samples: historical ERC-4626 totalAssets/totalSupply
//   snapshots used to compute the share-price APY WITHOUT any external oracle.
// Both tables are additive — no existing table is altered.
//   npm run db:discovery  →  scripts/migrateOnchain.js creates them idempotently.

import { query } from '../config/db.js';

export async function getDiscoveryState(chainId) {
  const result = await query(
    `SELECT chain_id AS "chainId", registry, last_block AS "lastBlock", updated_at AS "updatedAt"
       FROM discovery_state WHERE chain_id = $1`,
    [chainId],
  );
  return result.rows[0] || null;
}

export async function upsertDiscoveryState(chainId, registry, lastBlock) {
  await query(
    `INSERT INTO discovery_state (chain_id, registry, last_block, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chain_id) DO UPDATE SET
       registry = EXCLUDED.registry,
       last_block = EXCLUDED.last_block,
       updated_at = now()`,
    [chainId, registry, lastBlock],
  );
}

export async function listDiscoveryStates() {
  const result = await query(
    `SELECT chain_id AS "chainId", registry, last_block AS "lastBlock", updated_at AS "updatedAt"
       FROM discovery_state ORDER BY chain_id`,
  );
  return result.rows;
}

export async function insertShareSample({ chainId, vault, token, blockNo, totalAssets, totalSupply }) {
  await query(
    `INSERT INTO opportunity_share_samples (chain_id, vault, token, block_no, total_assets, total_supply)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (chain_id, vault, block_no) DO NOTHING`,
    [chainId, vault, token, blockNo, totalAssets.toString(), totalSupply.toString()],
  );
}

/** Two most recent share-price snapshots for a vault (oldest first). */
export async function latestShareSamples(chainId, vault, limit = 2) {
  const result = await query(
    `SELECT block_no AS "blockNo", total_assets AS "totalAssets", total_supply AS "totalSupply",
            sampled_at AS "sampledAt"
       FROM opportunity_share_samples
      WHERE chain_id = $1 AND vault = $2
      ORDER BY block_no ASC
      LIMIT $3`,
    [chainId, vault, limit],
  );
  return result.rows;
}

// ------------------------------------------------------------------ //
// Web → Web3 filter layer (pool-creation candidate queue)
// ------------------------------------------------------------------ //

export async function getWebFeedState(chainId) {
  const result = await query(
    `SELECT chain_id AS "chainId", last_block AS "lastBlock", updated_at AS "updatedAt"
       FROM discovery_web_state WHERE chain_id = $1`,
    [chainId],
  );
  return result.rows[0] || null;
}

export async function upsertWebFeedState(chainId, lastBlock) {
  await query(
    `INSERT INTO discovery_web_state (chain_id, last_block, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (chain_id) DO UPDATE SET
       last_block = EXCLUDED.last_block,
       updated_at = now()`,
    [chainId, lastBlock],
  );
}

export async function insertWebCandidate({
  chainId,
  kind,
  pool,
  tokenA,
  tokenB,
  fee,
  blockNo,
  screening,
  guardianLinked = false,
  linkedSlug = null,
}) {
  const key = `${chainId}:${kind}:${pool.toLowerCase()}`;
  await query(
    `INSERT INTO discovery_web_candidates
       (candidate_key, chain_id, kind, pool, token_a, token_b, fee, block_no,
        screening, guardian_linked, linked_slug, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (candidate_key) DO UPDATE SET
       block_no = GREATEST(discovery_web_candidates.block_no, EXCLUDED.block_no),
       screening = CASE
         WHEN discovery_web_candidates.screening->>'status' = 'flagged'
              AND EXCLUDED.screening->>'status' = 'screened'
         THEN discovery_web_candidates.screening
         ELSE EXCLUDED.screening
       END,
       guardian_linked = discovery_web_candidates.guardian_linked OR EXCLUDED.guardian_linked,
       linked_slug = COALESCE(EXCLUDED.linked_slug, discovery_web_candidates.linked_slug),
       updated_at = now()`,
    [key, chainId, kind, pool.toLowerCase(), tokenA.toLowerCase(), tokenB.toLowerCase(), fee ?? null, blockNo, JSON.stringify(screening), guardianLinked, linkedSlug],
  );
}

export async function markWebCandidatePosted({ chainId, kind, pool, slug }) {
  const key = `${chainId}:${kind}:${pool.toLowerCase()}`;
  await query(
    `UPDATE discovery_web_candidates
        SET posted_slug = $2, posted_at = now(), updated_at = now()
      WHERE candidate_key = $1`,
    [key, slug],
  );
}

export async function listWebCandidates({ chainId = null, limit = 200 } = {}) {
  const params = [];
  let where = '';
  if (chainId) {
    params.push(chainId);
    where = `WHERE chain_id = $1`;
  }
  params.push(limit);
  const result = await query(
    `SELECT candidate_key AS "candidateKey", chain_id AS "chainId", kind, pool,
            token_a AS "tokenA", token_b AS "tokenB", fee, block_no AS "blockNo",
            screening, guardian_linked AS "guardianLinked", linked_slug AS "linkedSlug",
            posted_slug AS "postedSlug", posted_at AS "postedAt",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM discovery_web_candidates
       ${where}
       ORDER BY block_no DESC
       LIMIT $${chainId ? 2 : 1}`,
    params,
  );
  return result.rows;
}

/**
 * Candidates still waiting to be qualified: status 'screened' but not yet
 * posted. The feed re-tests these for live liquidity and posts them once legit
 * (idempotent — a pool with no liquidity today can qualify on a later run).
 */
export async function listScreenedUnposted({ chainId = null, limit = 300 } = {}) {
  const params = [];
  let where = "screening->>'status' = 'screened' AND posted_slug IS NULL";
  if (chainId) {
    params.push(chainId);
    where = `chain_id = $1 AND ${where}`;
  }
  params.push(limit);
  const result = await query(
    `SELECT candidate_key AS "candidateKey", chain_id AS "chainId", kind, pool,
            token_a AS "tokenA", token_b AS "tokenB", fee, block_no AS "blockNo",
            screening
       FROM discovery_web_candidates
      WHERE ${where}
      ORDER BY block_no DESC
      LIMIT $${chainId ? 2 : 1}`,
    params,
  );
  return result.rows;
}

/** Store the liquidity evidence + legit verdict back onto a candidate. */
export async function updateWebCandidateLiquidity({ chainId, kind, pool, liquidity, legit }) {
  const key = `${chainId}:${kind}:${pool.toLowerCase()}`;
  await query(
    `UPDATE discovery_web_candidates
        SET screening = jsonb_set(jsonb_set(screening, '{liquidity}', $2::jsonb),
                                  '{legit}', to_jsonb($3::boolean)),
            updated_at = now()
      WHERE candidate_key = $1`,
    [key, JSON.stringify(liquidity), Boolean(legit)],
  );
}

export async function webFeedSummary() {
  const result = await query(
    `SELECT chain_id AS "chainId",
            COUNT(*)::int AS "candidates",
            COUNT(*) FILTER (WHERE (screening->>'status') = 'screened')::int AS "screened",
            COUNT(*) FILTER (WHERE (screening->>'status') = 'flagged')::int AS "flagged",
            COUNT(*) FILTER (WHERE guardian_linked)::int AS "guardianLinked",
            COUNT(*) FILTER (WHERE posted_slug IS NOT NULL)::int AS "posted"
       FROM discovery_web_candidates
      GROUP BY chain_id
      ORDER BY chain_id`,
  );
  return result.rows;
}