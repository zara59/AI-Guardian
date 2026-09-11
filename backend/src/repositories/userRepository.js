import { query } from '../config/db.js';

export async function findUserByWallet(walletAddress) {
  const result = await query(
    'SELECT id, wallet_address AS "walletAddress", display_name AS "displayName" FROM users WHERE wallet_address = $1',
    [walletAddress],
  );
  return result.rows[0] || null;
}

export async function getDefaultUser() {
  const result = await query(
    'SELECT id, wallet_address AS "walletAddress", display_name AS "displayName" FROM users ORDER BY id ASC LIMIT 1',
  );
  return result.rows[0] || null;
}

export async function createUser({ walletAddress, displayName }) {
  const result = await query(
    `INSERT INTO users (wallet_address, display_name)
     VALUES ($1, $2) RETURNING id, wallet_address AS "walletAddress", display_name AS "displayName"`,
    [walletAddress || null, displayName || null],
  );
  return result.rows[0];
}