import { query } from '../config/db.js';

export async function findByUserId(userId) {
  const result = await query(
    `SELECT id, user_id AS "userId", wallet_address AS "walletAddress",
            allocation, risk_preference AS "riskPreference", updated_at AS "updatedAt"
     FROM preferences WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

export async function upsert(userId, { walletAddress, allocation, riskPreference }) {
  const current = await findByUserId(userId);
  const nextWallet =
    walletAddress !== undefined
      ? walletAddress
      : current?.walletAddress || null;
  const nextAllocation =
    allocation !== undefined ? allocation : current?.allocation || 0;
  const nextRisk =
    riskPreference !== undefined ? riskPreference : current?.riskPreference || 'moderate';

  const result = await query(
    `INSERT INTO preferences (user_id, wallet_address, allocation, risk_preference)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET wallet_address = EXCLUDED.wallet_address,
                   allocation = EXCLUDED.allocation,
                   risk_preference = EXCLUDED.risk_preference,
                   updated_at = now()
     RETURNING id, user_id AS "userId", wallet_address AS "walletAddress",
               allocation, risk_preference AS "riskPreference"`,
    [userId, nextWallet, nextAllocation, nextRisk],
  );
  return result.rows[0];
}