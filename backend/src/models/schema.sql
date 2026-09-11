-- AI Guardian schema — Phase 2
-- PostgreSQL is the persistent source of truth.

DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS rankings CASCADE;
DROP TABLE IF EXISTS preferences CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS opportunities CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) UNIQUE,
  display_name  VARCHAR(120),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE preferences (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  wallet_address  VARCHAR(64),
  allocation      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  risk_preference VARCHAR(20) NOT NULL DEFAULT 'moderate',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opportunity attributes as reported/collected before ranking.
-- Each *_score column holds the collected metric value (0 .. its max),
-- higher = better. Ranking is computed, never stored as truth here.
CREATE TABLE opportunities (
  id                       SERIAL PRIMARY KEY,
  slug                     VARCHAR(120) NOT NULL UNIQUE,
  name                     VARCHAR(255) NOT NULL,
  protocol                 VARCHAR(255),
  category                 VARCHAR(50) NOT NULL,
  chain                    VARCHAR(50) NOT NULL DEFAULT 'Ethereum',
  description              TEXT,
  risk                     VARCHAR(20) NOT NULL,
  apy                      NUMERIC(8, 2),             -- NULL = unknown, never fabricated (no oracle)
  liquidity_rating         VARCHAR(50) NOT NULL DEFAULT 'Low',
  minimum_allocation       NUMERIC(18, 2),            -- NULL = no recommended minimum
  expected_interaction     VARCHAR(255),
  why_guardian_likes       TEXT,
  risks                    JSONB NOT NULL DEFAULT '[]',
  hard_flags               JSONB NOT NULL DEFAULT '[]',
  -- Phase 3: real provider data identity + provenance
  chain_id                 INTEGER NOT NULL DEFAULT 1,
  contract_address         VARCHAR(64),
  asset                    VARCHAR(50),
  tvl_usd                  NUMERIC(20, 2),            -- NULL = unknown, never fabricated (no oracle)
  apy_type                 VARCHAR(20) NOT NULL DEFAULT 'APY',
  data_sources             JSONB NOT NULL DEFAULT '[]',
  last_updated             TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_confidence          VARCHAR(12) NOT NULL DEFAULT 'Low',
  eligibility              VARCHAR(20) NOT NULL DEFAULT 'insufficient-data',
  eligibility_reason       TEXT,
  security_status          VARCHAR(30) NOT NULL DEFAULT 'unavailable',
  -- Security / Risk (max 35)
  smart_contract_security  NUMERIC(5, 1) NOT NULL DEFAULT 0,
  protocol_history         NUMERIC(5, 1) NOT NULL DEFAULT 0,
  liquidity_stability      NUMERIC(5, 1) NOT NULL DEFAULT 0,
  contract_permissions     NUMERIC(5, 1) NOT NULL DEFAULT 0,
  exploit_indicators       NUMERIC(5, 1) NOT NULL DEFAULT 0,
  -- Potential (max 25)
  current_yield            NUMERIC(5, 1) NOT NULL DEFAULT 0,
  historical_sustainability NUMERIC(5, 1) NOT NULL DEFAULT 0,
  incentives               NUMERIC(5, 1) NOT NULL DEFAULT 0,
  opportunity_size         NUMERIC(5, 1) NOT NULL DEFAULT 0,
  market_conditions        NUMERIC(5, 1) NOT NULL DEFAULT 0,
  -- Sustainability (max 15)
  business_model           NUMERIC(5, 1) NOT NULL DEFAULT 0,
  reward_sustainability    NUMERIC(5, 1) NOT NULL DEFAULT 0,
  protocol_activity        NUMERIC(5, 1) NOT NULL DEFAULT 0,
  -- Liquidity (max 10)
  available_liquidity      NUMERIC(5, 1) NOT NULL DEFAULT 0,
  withdrawal_conditions    NUMERIC(5, 1) NOT NULL DEFAULT 0,
  -- User fit (max 15)
  minimum_capital          NUMERIC(5, 1) NOT NULL DEFAULT 0,
  risk_preference_fit      NUMERIC(5, 1) NOT NULL DEFAULT 0,
  complexity               NUMERIC(5, 1) NOT NULL DEFAULT 0,
  time_commitment          NUMERIC(5, 1) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- On-chain discovery provenance (filter-for-web3).
  -- 'curated' = Web3 Data/opportunities.json pipeline; 'onchain' = GuardianRegistry discovery;
  -- 'webfeed' = public pool-creation scan that passed token + liquidity verification.
  source                  VARCHAR(20) NOT NULL DEFAULT 'curated',
  metadata_uri            TEXT,
  registered_at           TIMESTAMPTZ,
  strategy_address        VARCHAR(64),
  asset_address           VARCHAR(64)
);

CREATE TABLE rankings (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  allocation      NUMERIC(18, 2) NOT NULL,
  risk_preference VARCHAR(20) NOT NULL,
  result          JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rankings_user_created ON rankings (user_id, created_at DESC);

CREATE TABLE activities (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_user_created ON activities (user_id, created_at DESC);
CREATE INDEX idx_opportunities_risk ON opportunities (risk);
CREATE INDEX idx_opportunities_category ON opportunities (category);
CREATE INDEX idx_opportunities_chain ON opportunities (chain);
CREATE INDEX idx_opportunities_eligibility ON opportunities (eligibility);
CREATE INDEX idx_opportunities_last_updated ON opportunities (last_updated);

-- On-chain opportunity discovery (filter-for-web3) — strictly additive.
--   discovery_state: per-chain incremental scanner cursor (restart-safe).
--   opportunity_share_samples: ERC-4626 share-price snapshots used to derive
--     APY with zero external oracles (Guardian samples its own data).
CREATE TABLE discovery_state (
  chain_id   INTEGER PRIMARY KEY,
  registry   VARCHAR(64) NOT NULL,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE opportunity_share_samples (
  id           BIGSERIAL PRIMARY KEY,
  chain_id     INTEGER NOT NULL,
  vault        VARCHAR(64) NOT NULL,
  token        VARCHAR(64),
  block_no     BIGINT NOT NULL,
  total_assets VARCHAR(80) NOT NULL,
  total_supply VARCHAR(80) NOT NULL,
  sampled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, vault, block_no)
);
CREATE INDEX idx_share_samples_vault
  ON opportunity_share_samples (chain_id, vault, block_no DESC);
CREATE INDEX idx_opportunities_source ON opportunities (source);
CREATE INDEX idx_opportunities_asset_address ON opportunities (asset_address);

-- Web → Web3 filter layer (surfacing opportunities "on the web", then moving
-- them "to web3"): public pool-creation events (Uniswap V2/V3) are scanned
-- chain-wide, each candidate is screened on-chain (token bytecode/decimals/
-- symbol), and candidates that ALSO hold live on-chain liquidity are posted as
-- rankable opportunities (source = 'webfeed', posted_slug records it). Valued
-- honestly: apy/tvlUsd stay NULL (no oracle) and raw reserves are kept as
-- evidence. Everything else stays in the queue as flagged/screened — nothing
-- fabricated, nothing guessed.
CREATE TABLE discovery_web_state (
  chain_id   INTEGER PRIMARY KEY,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discovery_web_candidates (
  candidate_key   VARCHAR(120) PRIMARY KEY,          -- {chainId}:{kind}:{pool}
  chain_id        INTEGER NOT NULL,
  kind            VARCHAR(8) NOT NULL,               -- v2 | v3
  pool            VARCHAR(64) NOT NULL,              -- pair / pool address
  token_a         VARCHAR(64) NOT NULL,
  token_b         VARCHAR(64) NOT NULL,
  fee             INTEGER,
  block_no        BIGINT NOT NULL,
  screening       JSONB NOT NULL DEFAULT '{"status":"pending","reasons":[]}'::jsonb,
  guardian_linked BOOLEAN NOT NULL DEFAULT FALSE,    -- asset is a verified Guardian strategy asset
  linked_slug     VARCHAR(160),
  posted_slug     VARCHAR(160),                      -- opportunity posted for this legit candidate
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_web_candidates_pool ON discovery_web_candidates (pool);
CREATE INDEX idx_web_candidates_screening
  ON discovery_web_candidates ((screening ->> 'status'));

-- Phase 4: wallet-signed transactions prepared by the backend bridge.
-- The backend never signs; it only prepares (server-derived targets + risk
-- gate) and then records the user-signed result for the Activity timeline and
-- resulting-state verification.
CREATE TABLE transactions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  prepare_id      VARCHAR(64) NOT NULL UNIQUE,
  opportunity_id  INTEGER,
  type            VARCHAR(20) NOT NULL,               -- approve | deposit | withdraw
  chain           VARCHAR(50) NOT NULL,               -- network id
  chain_id        INTEGER NOT NULL,                   -- real chain id
  token_address   VARCHAR(64) NOT NULL,
  token_decimals  INTEGER NOT NULL,
  vault_address   VARCHAR(64) NOT NULL,
  strategy_address VARCHAR(64),
  amount_raw      VARCHAR(80) NOT NULL,               -- BigInt decimal string
  amount_human    VARCHAR(80) NOT NULL,               -- decimal string
  spend_to        VARCHAR(64) NOT NULL,               -- the contract the tx calls
  status          VARCHAR(20) NOT NULL DEFAULT 'prepared', -- prepared|signed|pending|confirmed|failed|expired|rejected
  tx_hash         VARCHAR(66),
  block_number    INTEGER,
  gas_used        VARCHAR(40),
  error_message   TEXT,
  signed_at       TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_created ON transactions (user_id, created_at DESC);
CREATE INDEX idx_transactions_prepare_id ON transactions (prepare_id);
CREATE INDEX idx_transactions_status ON transactions (status);