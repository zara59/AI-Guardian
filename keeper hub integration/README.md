# Phase 5 — KeeperHub Integration & Controlled On-Chain Execution

Real KeeperHub as the controlled execution layer for AI Guardian approved
workflows on **Ethereum Sepolia**. Phase 4 (direct wallet-signed execution)
remains as the baseline fallback.

- **Execution method**: KeeperHub REST API **Direct Execution**
  (`POST /api/execute/contract-call`) — not MCP, not the CLI, not the SDK.
- **Boundary contract**: the existing Phase 4 **GuardianVault** (ERC-4626).
  No second contract is created.
- **Prerequisite**: real contract deployment on Sepolia
  (`ai-guardian/security-layer/config/contracts/11155111.json`) and a real
  KeeperHub organization API key (`kh_`). Until then, `executionMode` falls
  back to `direct` and nothing is faked.

---

## How it works

```
 Opportunity picked by the user
        │
        ▼
[1] createWorkflow        server derives EXACT targets/amounts from the
        │                 contract registry — no raw client input
        ▼
[2] approveWorkflow       user reviews + explicitly approves (approvalId)
        │                 integrity re-hash runs BEFORE recording approval
        ▼
[3] executeWorkflow       simulation first (KEEPERHUB_SIMULATE_FIRST)
        │                 then POST /api/execute/contract-call with a
        │                 deterministic Idempotency-Key (from workflow hash)
        ▼
[4] pollExecutionStatus   GET /api/execute/{id}/status honoring
        │                 X-Poll-Interval-Hint (0 → terminal)
        ▼
[5] verifyExecution       independent RPC verification of receipt + vault
        │                 state — blockchain is the source of truth
        ▼
      confirmed / failed
```

## Rules enforced in code

- **No arbitrary calldata, targets, tokens, amounts, or chains** — everything
  is resolved from `security-layer/backend/registry.js` at preparation time.
- **Workflows are immutable after approval** — any field change breaks the
  SHA-256 `workflowHash` and the execution is rejected (`INTEGRITY`).
- **No duplicate execution** — deterministic idempotency key derived from the
  workflow hash; KeeperHub 409 conflicts are surfaced as such.
- **No private keys, ever** — KeeperHub API key (`kh_`) lives server-side in
  env only; user wallet signs nothing; frontend never sees the key.
- **No fake statuses** — final `confirmed` only after independent on-chain
  verification. Unknown KeeperHub statuses pass through unmapped.
- **Risk gate** — `avoid` / `insufficient-data` / `high` opportunities are
  blocked before any workflow exists.

## Environment variables (backend/.env.example)

| Variable | Purpose |
| --- | --- |
| `KEEPERHUB_API_KEY` | `kh_` organization key. Unset → `direct` mode. |
| `KEEPERHUB_WALLET_ADDRESS` | KeeperHub public execution wallet (funded with Sepolia ETH + gTEST). |
| `KEEPERHUB_BASE_URL` | default `https://app.keeperhub.com` |
| `KEEPERHUB_SIMULATE_FIRST` | `true` → never broadcast before simulation passes |
| `KEEPERHUB_POLL_MAX_ATTEMPTS` / `KEEPERHUB_POLL_INTERVAL_MS` | bounded polling |

## API

All mounted under `/api/workflows` (see `backend/src/app.js`, which imports
`backend/routes.js` from this folder).

| Method + path | Purpose |
| --- | --- |
| `POST /api/workflows/prepare` | create a deterministic workflow for review |
| `POST /api/workflows/:workflowId/approve` | user approves (records `approvalId`) |
| `POST /api/workflows/:workflowId/execute` | `{ approvalId }` → submit to KeeperHub |
| `POST /api/workflows/:workflowId/execute-and-poll` | submit and poll to completion |
| `GET /api/workflows/:workflowId/status` | current status |
| `POST /api/workflows/:workflowId/poll` | poll once (bounded) |
| `POST /api/workflows/:workflowId/reconcile` | independent blockchain verification |
| `GET /api/workflows` | recent workflows for the user |

## Files

- `backend/config.js` — env config + validation (never exposes the raw key)
- `backend/client.js` — KeeperHub REST HTTP client
- `backend/adapterInterface.js` — adapter contract (`simulate`/`execute`/`getStatus`/`getName`)
- `backend/keeperhubAdapter.js` — real KeeperHub adapter
- `backend/directAdapter.js` — Phase 4 bridge wrapped as a baseline adapter
- `backend/workflowService.js` — core business logic (prepare/approve/execute/status/list/reconcile)
- `backend/repository.js` — `workflow_executions` CRUD (PostgreSQL)
- `backend/poller.js` — bounded status polling + state mapping
- `backend/verifier.js` — independent on-chain verification
- `backend/controller.js` / `backend/routes.js` — Express layer
- `database/001_workflow_executions.sql` + `database/migrate.js` — schema migration
- `frontend/` — `useKeeperHubTransaction` hook, `KeeperHubApprovalPreview`,
  `KeeperHubTransactionStatus`, `status.js` helpers
- `tests/workflow.test.js` — 31 unit tests (hash determinism, risk gate,
  approval integrity, idempotency, verification)

The main frontend imports these via re-export seams in
`frontend/src/hooks/useKeeperHubTransaction.js` and
`frontend/src/components/KeeperHub*`.

## Running

```bash
# 1. Database migration
node "keeper hub integration/database/migrate.js"

# 2. Backend (phases 1-4 stay intact; workflows mounted at /api/workflows)
cd backend && npm run dev

# 3. Frontend
cd frontend && npm run dev

# 4. Tests
cd "keeper hub integration" && node --test tests/workflow.test.js
```

## Live demo prerequisites (blocked until)

1. Deploy `GuardianTestToken`, `GuardianSimpleStakingStrategy`,
   `GuardianVault` to Sepolia → write `security-layer/config/contracts/11155111.json`.
2. Create a KeeperHub account + organization → `kh_` API key.
3. Fund the KeeperHub wallet: Sepolia ETH (gas) + gTEST (deposit asset).

Nothing is executed in this phase without those three real-world pieces.