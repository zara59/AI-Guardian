import { query } from '../config/db.js';

export async function save(result, { userId, allocation, riskPreference }) {
  const res = await query(
    `INSERT INTO rankings (user_id, allocation, risk_preference, result)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id`,
    [userId, allocation, riskPreference, JSON.stringify(result)],
  );
  return res.rows[0].id;
}

export async function findLatestByUser(userId, limit = 10) {
  const result = await query(
    `SELECT id, user_id AS "userId", allocation, risk_preference AS "riskPreference",
            result, created_at AS "createdAt"
     FROM rankings
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}