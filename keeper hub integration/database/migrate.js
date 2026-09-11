// Phase 5: migrations runner.
//
// Applies the workflow_executions schema to PostgreSQL.
//
// Usage:  node "keeper hub integration/database/migrate.js"
//
// Safe to run multiple times (CREATE TABLE IF NOT EXISTS).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../../backend/src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = await readFile(path.join(__dirname, '001_workflow_executions.sql'), 'utf8');
  console.log('Applying Phase 5 migrations…');
  await query(sql);
  console.log('Phase 5 migrations applied successfully.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});