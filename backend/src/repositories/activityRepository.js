import { query } from '../config/db.js';

export async function insert({ userId, type, title, description, metadata, createdAt }, client = query) {
  const result = await client(
    `INSERT INTO activities (user_id, type, title, description, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6, now()))
     RETURNING id, type, title, description, metadata, created_at AS "timestamp"`,
    [userId, type, title, description, metadata ? JSON.stringify(metadata) : null, createdAt || null],
  );
  return result.rows[0];
}

export async function findByUserId(userId, limit = 50) {
  const result = await query(
    `SELECT id, type, title, description, metadata, created_at AS "timestamp"
     FROM activities
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}