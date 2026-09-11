-- Phase 6: additive columns for reconciliation + funding.
--
-- ALTERs are idempotent (ADD COLUMN IF NOT EXISTS). They do not modify any
-- Phase 5 behavior — existing rows and consumers are unaffected.

ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS reconciled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciliation   JSONB,
  ADD COLUMN IF NOT EXISTS funding_state    VARCHAR(30),
  ADD COLUMN IF NOT EXISTS funding_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN workflow_executions.reconciliation IS
  'Phase 6 three-way reconciliation verdict (application / KeeperHub / blockchain).';
COMMENT ON COLUMN workflow_executions.funding_state IS
  'Phase 6 execution-wallet gate: not_configured|wallet_invalid|deployment_missing|chain_unreachable|insufficient_gas|insufficient_token_balance|insufficient_allowance|ready.';

CREATE INDEX IF NOT EXISTS idx_wf_exec_funding_state ON workflow_executions (funding_state);
CREATE INDEX IF NOT EXISTS idx_wf_exec_reconciled   ON workflow_executions (reconciled_at);