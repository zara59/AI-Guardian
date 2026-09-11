import pg from 'pg';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle Postgres client', {
    message: err.message,
  });
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

export async function checkDatabaseConnection() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0].ok === 1;
}

export async function closeDatabase() {
  try {
    await pool.end();
  } catch (err) {
    logger.warn('Error closing database pool', { message: err.message });
  }
}

export { pool };