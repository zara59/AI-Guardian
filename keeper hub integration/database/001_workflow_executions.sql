-- Phase 5: KeeperHub workflow_executions.
--
-- PostgreSQL is the durable source of truth for every KeeperHub lifecycle
-- record. This table is separate from the Phase 4 `transactions` table so the
-- direct (Phase 4) flow and the KeeperHub flow stay distinguishable.
--
-- No private keys are ever stored here. Only wallet addresses (public
-- identifiers) and execution metadata.

CREATE TABLE IF NOT EXISTS workflow_executions (
  id                  SERIAL PRIMARY KEY,
  workflow_id         VARCHAR(64) NOT NULL UNIQUE,     -- deterministic from content hash
  approval_id         VARCHAR(64) UNIQUE,              -- set when the user approves
  opportunity_id      INTEGER,
  user_id             INTEGER,
  wallet_address      VARCHAR(64) NOT NULL,            -- the user's public address

  -- Workflow parameters (immutable after approval)
  chain_id            INTEGER NOT NULL DEFAULT 11155111,
  chain               VARCHAR(50) NOT NULL DEFAULT 'sepolia',
  token_address       VARCHAR(64) NOT NULL,
  token_decimals      INTEGER NOT NULL DEFAULT 6,
  vault_address       VARCHAR(64) NOT NULL,
  strategy_address    VARCHAR(64),
  operation           VARCHAR(20) NOT NULL,            -- approve | deposit | withdraw
  amount_raw          VARCHAR(80) NOT NULL,            -- BigInt decimal string
  amount_human        VARCHAR(80) NOT NULL,            -- decimal string

  -- Integrity
  workflow_hash       VARCHAR(64) NOT NULL,            -- SHA-256 of canonical workflow
  risk_score          NUMERIC(5,1),
  risk_classification VARCHAR(20),
  risk_gate_passed    BOOLEAN NOT NULL DEFAULT false,

  -- Approval
  approved            BOOLEAN NOT NULL DEFAULT false,
  approved_at         TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL,

  -- Execution
  execution_mode      VARCHAR(20) NOT NULL DEFAULT 'keeperhub', -- keeperhub | direct
  idempotency_key     VARCHAR(64),                     -- deterministic KeeperHub key
  kh_execution_id     VARCHAR(64),                     -- KeeperHub execution ID
  kh_status           VARCHAR(30),                     -- KeeperHub-reported status
  tx_hash             VARCHAR(66),                     -- blockchain tx hash
  block_number        INTEGER,
  gas_used            VARCHAR(40),
  receipt_status      VARCHAR(20),                     -- success | failed
  sponsored           BOOLEAN NOT NULL DEFAULT false,

  -- Final state
  final_state         VARCHAR(20) NOT NULL DEFAULT 'created',
  -- created | approved | submitted | accepted | executing | confirmed | failed | expired | cancelled
  failure_reason      TEXT,
  verified_at         TIMESTAMPTZ,
  verified_events     JSONB,
  verified_state      JSONB,

  -- Metadata
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow_id ON workflow_executions (workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_approval_id ON workflow_executions (approval_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_user_created ON workflow_executions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_exec_kh_execution_id ON workflow_executions (kh_execution_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_tx_hash ON workflow_executions (tx_hash);
CREATE INDEX IF NOT EXISTS idx_wf_exec_final_state ON workflow_executions (final_state);
CREATE INDEX IF NOT EXISTS idx_wf_exec_status_updated ON workflow_executions (final_state, updated_at);