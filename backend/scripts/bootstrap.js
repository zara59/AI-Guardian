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

/**
 * Idempotent DB initialization for first boot (e.g. Render blueprint).
 * Runs only when the schema is missing, so restarting never wipes data.
 */
export async function bootstrapDatabase() {
  if (await tableExists('opportunities')) {
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
  return { status: 'initialized', opportunities: SEED_OPPORTUNITIES.length };
}