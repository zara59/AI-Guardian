// Database setup script for the local development environment.
//
//   npm run db:setup
//
// Creates the ai_guardian database (if missing), applies schema.sql
// (DROP + recreate for a clean dev slate), then seeds the demo user,
// preferences, a deterministic real-data snapshot and the activity feed.

import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/index.js';
import { query, closeDatabase } from '../src/config/db.js';
import { closeCache } from '../src/cache/redisClient.js';
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

// Derive a connection to the default admin DB from DATABASE_URL so we do
// not need a superuser to CREATE DATABASE via a maintenance connection.
function adminClient() {
  const url = new URL(config.databaseUrl);
  const dbName = url.pathname.slice(1) || 'ai_guardian';
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  return { client, dbName };
}

async function ensureDatabase() {
  const { client, dbName } = adminClient();
  await client.connect();
  try {
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`Created database "${dbName}".`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } finally {
    await client.end();
  }
}

async function applySchema() {
  const schemaPath = path.join(__dirname, '..', 'src', 'models', 'schema.sql');
  const sql = await readFile(schemaPath, 'utf8');
  await query(sql);
  console.log('Schema applied (DROP + recreate).');
}

async function seed() {
  const user = await userRepository.createUser(SEED_USER);
  await preferenceRepository.upsert(user.id, SEED_PREFERENCES);

  // Phase 3 baseline: seed the deterministic real-data snapshot. The LIVE
  // provider pipeline runs at server boot and via POST /api/opportunities/
  // refresh — db:setup stays fast, offline-safe and deterministic.
  for (const opp of SEED_OPPORTUNITIES) {
    await opportunityRepository.insert(opp);
  }

  // Seed activities with staggered timestamps so the feed reads oldest-to-newest.
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

  console.log(`Seeded user #${user.id} with ${SEED_OPPORTUNITIES.length} opportunities.`);
}

async function main() {
  try {
    await ensureDatabase();
    await applySchema();
    await seed();
    console.log('Database setup complete.');
  } catch (err) {
    console.error('Database setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
    await closeCache();
  }
}

main();