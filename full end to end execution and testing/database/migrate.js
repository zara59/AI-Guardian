// Phase 6: migrations runner (Phase 5 schema + Phase 6 additive columns).
//
// Usage:  node "full end to end execution and testing/database/migrate.js"
//
// Safe to run multiple times (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
// EXISTS).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../../backend/src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const files = ['001_workflow_executions.sql', '002_phase6.sql'];
  for (const f of files) {
    const sql = await readFile(path.join(__dirname, f), 'utf8');
    console.log(`Applying ${f}…`);
    await query(sql);
  }
  console.log('Phase 5 + Phase 6 migrations applied successfully.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});