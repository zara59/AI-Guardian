import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../src/config/db.js';
import * as userRepository from '../src/repositories/userRepository.js';
import * as preferenceRepository from '../src/repositories/preferenceRepository.js';
import * as opportunityRepository from '../src/repositories/opportunityRepository.js';
import * as activityRepository from '../src/repositories/activityRepository.js';
import {
  SEED_USER,
  SEED_PREFERENCES,
  SEED_OPPORTUNITIES,
  SEED_ACTIVITIES,
} from '../src/models/seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function tableExists(name) {
  const res = await query(
    "SELECT 1 FROM pg_class WHERE relname = $1 AND relkind = 'r'",
    [name],
  );
  return res.rowCount > 0;
}

// Phase 5 + Phase 6 additive migrations. Idempotent (CREATE TABLE IF NOT
// EXISTS / ADD COLUMN IF NOT EXISTS), safe on every boot.
async function applyPhaseMigrations() {
  const files = [
    'keeper hub integration/database/001_workflow_executions.sql',
    'full end to end execution and testing/database/002_phase6.sql',
  ];
  for (const rel of files) {
    const sql = await readFile(path.join(__dirname, '..', '..', rel), 'utf8');
    await query(sql);
  }
  console.log('Bootstrap: Phase 5 + Phase 6 migrations applied.');
}

/**
 * Idempotent DB initialization for first boot (e.g. Render blueprint).
 * Runs the base schema only when it's missing, so restarting never wipes data.
 * Phase 5/6 migrations always run (they're additive + idempotent).
 */
export async function bootstrapDatabase() {
  if (await tableExists('opportunities')) {
    await applyPhaseMigrations();
    return { status: 'already-initialized' };
  }

  const schemaPath = path.join(__dirname, '..', 'src', 'models', 'schema.sql');
  const sql = await readFile(schemaPath, 'utf8');
  await query(sql);
  console.log('Bootstrap: schema created.');

  const user = await userRepository.createUser(SEED_USER);
  await preferenceRepository.upsert(user.id, SEED_PREFERENCES);

  for (const opp of SEED_OPPORTUNITIES) {
    await opportunityRepository.insert(opp);
  }

  const now = Date.now();
  for (let i = 0; i < SEED_ACTIVITIES.length; i += 1) {
    const a = SEED_ACTIVITIES[i];
    await activityRepository.insert({
      userId: user.id,
      type: a.type,
      title: a.title,
      description: a.description,
      metadata: a.metadata,
      createdAt: new Date(now - (SEED_ACTIVITIES.length - i) * 60000),
    });
  }

  console.log(
    `Bootstrap: seeded user #${user.id} with ${SEED_OPPORTUNITIES.length} opportunities.`,
  );

  await applyPhaseMigrations();
  return { status: 'initialized', opportunities: SEED_OPPORTUNITIES.length };
}