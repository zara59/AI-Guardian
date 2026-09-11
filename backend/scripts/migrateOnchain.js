// Idempotent migration for the on-chain opportunity discovery schema.
//
//   npm run db:discovery
//
// Adds the on-chain provenance columns to `opportunities` and creates the
// discovery tables WITHOUT dropping anything — safe to run against an
// existing database (unlike db:setup, which recreates the schema).

import { query, closeDatabase } from '../src/config/db.js';
import { closeCache } from '../src/cache/redisClient.js';

const STATEMENTS = [
  `ALTER TABLE opportunities
     ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'curated'`,
  `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS metadata_uri TEXT`,
  `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ`,
  `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS strategy_address VARCHAR(64)`,
  `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS asset_address VARCHAR(64)`,
  // "Honest null": APY/TVL/minimum may be genuinely unknown (no oracle used),
  // so the columns must allow NULL instead of forcing a fabricated 0.
  `ALTER TABLE opportunities ALTER COLUMN apy DROP NOT NULL`,
  `ALTER TABLE opportunities ALTER COLUMN tvl_usd DROP NOT NULL`,
  `ALTER TABLE opportunities ALTER COLUMN minimum_allocation DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities (source)`,
  `CREATE INDEX IF NOT EXISTS idx_opportunities_asset_address ON opportunities (asset_address)`,
  `CREATE TABLE IF NOT EXISTS discovery_state (
     chain_id   INTEGER PRIMARY KEY,
     registry   VARCHAR(64) NOT NULL,
     last_block BIGINT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS opportunity_share_samples (
     id           BIGSERIAL PRIMARY KEY,
     chain_id     INTEGER NOT NULL,
     vault        VARCHAR(64) NOT NULL,
     token        VARCHAR(64),
     block_no     BIGINT NOT NULL,
     total_assets VARCHAR(80) NOT NULL,
     total_supply VARCHAR(80) NOT NULL,
     sampled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (chain_id, vault, block_no)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_share_samples_vault
     ON opportunity_share_samples (chain_id, vault, block_no DESC)`,
  `CREATE TABLE IF NOT EXISTS discovery_web_state (
     chain_id   INTEGER PRIMARY KEY,
     last_block BIGINT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS discovery_web_candidates (
     candidate_key   VARCHAR(120) PRIMARY KEY,
     chain_id        INTEGER NOT NULL,
     kind            VARCHAR(8) NOT NULL,
     pool            VARCHAR(64) NOT NULL,
     token_a         VARCHAR(64) NOT NULL,
     token_b         VARCHAR(64) NOT NULL,
     fee             INTEGER,
     block_no        BIGINT NOT NULL,
     screening       JSONB NOT NULL DEFAULT '{"status":"pending","reasons":[]}'::jsonb,
     guardian_linked BOOLEAN NOT NULL DEFAULT FALSE,
     linked_slug     VARCHAR(160),
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_web_candidates_pool ON discovery_web_candidates (pool)`,
  `CREATE INDEX IF NOT EXISTS idx_web_candidates_screening
     ON discovery_web_candidates ((screening ->> 'status'))`,
  `ALTER TABLE discovery_web_candidates ADD COLUMN IF NOT EXISTS posted_slug VARCHAR(160)`,
  `ALTER TABLE discovery_web_candidates ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_web_candidates_posted
     ON discovery_web_candidates (posted_slug) WHERE posted_slug IS NOT NULL`,
];

async function main() {
  try {
    for (const sql of STATEMENTS) {
      await query(sql);
    }
    console.log('On-chain discovery schema is up to date (idempotent).');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
    await closeCache();
  }
}

main();