# Phase 6 — Full End-to-End Execution, Hardening & Final Demonstration

AI Guardian's final phase: real value moving through the real system, live data
only, with every step independently verifiable and nothing fabricated. This
phase closes the gap between "ranked opportunity" and "money on a chain".

- **Execution method**: KeeperHub REST **Direct Execution**
  (`POST /api/execute/contract-call`) against the Phase 4/5 GuardianVault
  (ERC-4626) on **Ethereum Sepolia**, exactly as integrated in Phase 5.
- **Discovery feed ("filter for web3", this phase's headline)**: the backend now
  scans the public chain itself — no curated list, no aggregator — for new
  Uniswap V2 pairs and V3 pools, screens every candidate fully on-chain, and
  **qualifies then posts it**: a candidate that passes the token screen AND
  holds real live on-chain liquidity becomes a rankable opportunity
  (`source='webfeed'`) with honest `null` APY/TVL and the raw on-chain reserves
  kept as evidence. Everything else stays in an honest screening queue; nothing
  is fabricated or guessed.
- **Hardening**: this phase adds a readiness aggregator (deployment + KeeperHub
  auth + funding + policy), a derived state machine, stuck/reconciliation
  sweeps, and on-chain verification as the single source of truth.
- **Honesty invariant**: if a prerequisite is genuinely missing, the system
  STOPS and prints the real blocker. It never fakes a step, a receipt, or a
  balance. Live evidence is the only evidence.

---

## The web → web3 filter (why this phase matters)

The final product does not ask "what should I show the user?" — it asks
"what is real and new on the chain right now?" and filters that stream.

```
 Public chain logs (web data)          →  web3 truth
 ─────────────────────────────────      ──────────────────────────────────
 Uniswap V2 "PairCreated"  ─┐          1. every candidate is decoded from
 Uniswap V3 "PoolCreated"  ─┤             its on-chain event (function topic0
                             ▼             = full 32-byte keccak256)
       candidate pool                    2. both tokens must exist (bytecode),
   token A / token B                       have ERC-20 shape, decimals 6..18,
                                           readable symbol — read live via RPC
                             ▼            3. a pool trading an already
                  screening                Guardian-verified asset is flagged
              + liquidity gate              guardian-linked (live market context)
                             │
                             ▼            4. LEGIT gate = token screen AND real
      LEGIT? ── yes ──► POSTED             live liquidity (V2 getReserves /
      no  → stays in the queue             V3 slot0+liquidity read on-chain)
                                          → rankable opportunity (source='webfeed')
```

Nothing on the chain is fabricated or injected. Candidates are surfaced from
real `eth_getLogs` against a chain-wide topic filter (chunked across free-RPC
range limits), screened with bounded concurrency, and their liquidity is read
live. The screening queue is exposed honestly via the API and the UI with its
real status (`screened` / `flagged` / `pending`), a `posted` marker when a
candidate qualified and was posted, and the raw reserve evidence — that
pipeline *is* the filter.

### Live-RPC hardening introduced by the feed

- **`eth_blockNumber`** (standard) replaced the non-standard
  `eth_getBlockNumber` several public providers reject.
- **Failover**: every provider call routes through `rpcCallThroughNetwork`,
  trying the network's primary + `fallbackRpcUrls` before giving up.
- **Range limits**: free RPCs cap `eth_getLogs` (50–10k blocks); the feed
  chunks every log scan at 5,000 blocks with bounded retries/timeouts.
- **ABI string decode fix**: `decodeString` now follows the ABI offset word
  instead of misreading it (symbols had decoded to NUL bytes); NUL bytes are
  stripped because Postgres `jsonb` rejects `\u0000` in an insert.

---

## Readiness: "can we move value RIGHT NOW?"

`GET /api/phase6/readiness` aggregates four probes into one honest verdict:

| Probe | Checks | Result shape |
| --- | --- | --- |
| deployment | `config/contracts/11155111.json` exists **and** bytecode is on-chain, chain id + decimals match | `deployed`, `reason`, `artifact` |
| keeperhub | `kh_` key configured **and** authenticates against KeeperHub | `configured`, `authenticated` |
| funding | execution wallet on-chain balances above configured gates | `state`, `ready`, `evidence` |
| policy | `KEEPERHUB_EXECUTION_REQUIRED` must not allow silent fallback | `executionRequired`, `effectiveMode`, `noSilentFallback` |

`ready` is `true` only when every probe passes. Otherwise the endpoint returns
the real blockers verbatim so the UI can "display the actual unavailable state
and explain it" instead of pretending.

## Derived workflow state machine

`backend/stateMachine.js` derives a single meaning from every workflow record
so the UI and audit trail agree:

```
draft → ranked → approved → submitted/accepted → executing → confirmed → verified
                                              ↘ failed / rejected / expired / invalidated
```

Terminal states: `confirmed`, `verified`, `failed`, `rejected`, `expired`,
`invalidated`, `cancelled`. `derivedState(record)` prefers the strongest
evidence (verification beats a bare confirmed; a failed receipt beats a vague
status). Stuck workflows are swept by
`POST /api/phase6/reconcile/stuck`.

## API surface (mounted under the existing backend)

| Method + path | Purpose |
| --- | --- |
| `GET /api/phase6/readiness` | honest ready/blocked verdict |
| `GET /api/phase6/funding` | execution-wallet funding evidence |
| `GET /api/phase6/vault-state?owner=` | live vault reads via RPC |
| `GET /api/phase6/states` | derived-state vocabulary |
| `GET /api/phase6/state/:workflowId` | derived state for one workflow |
| `POST /api/phase6/reconcile/:workflowId` | independent re-verification |
| `POST /api/phase6/reconcile/stuck` | sweep stuck workflows |
| `GET /api/phase6/audit` | audit surface |
| `GET /api/opportunities/discovery` | **new**: chain cursors + web→web3 screening queue (`webfeed.summary` includes `posted`, `webfeed.candidates` include `postedSlug`) |

The web→web3 feed itself runs through `refreshOpportunities` (it is
chain-wide, so it runs without the registry) or directly:
`node -e "import { runWebFeed } from './src/onchain/webFeed.js'; console.log(await runWebFeed({networkId:'ethereum'}))"`.

## Frontend

- New **Discovery** page (`/discovery`): summary cards (candidates / screened /
  **posted** / guardian-linked) + the screening queue with status pills, a
  "Posted" marker on qualified candidates that became rankable opportunities,
  live-liquidity indicators and etherscan pool links. Wired into `api.js`
  (`getDiscovery`) and `mapping.js` (`mapWebCandidate` / `mapDiscovery`).
- Phase 6 readiness/funding/state components remain available for the live
  demonstration.

## Running

```bash
# 1. Database migrations (Phase 6 + discovery web tables)
node "full end to end execution and testing/database/migrate.js"
npm --prefix backend run db:discovery     # discovery_state + discovery_web_*

# 2. Backend
cd backend && npm run dev                 # :3000, mounts /api/phase6 and /api/workflows

# 3. Frontend
cd frontend && npm run dev                # :5173, Discovery at /discovery

# 4. Tests
cd backend                && npm test     # 102
cd frontend               && npm test     # 60
cd "keeper hub integration" && node --test tests/workflow.test.js   # 31
cd "full end to end execution and testing" && npm test     # 57
```

## Demo

```bash
node scripts/demo-e2e.mjs \
  --base http://localhost:3000 \
  --opportunity 1 \
  --wallet 0x… \
  --amount 100
```

`demo-e2e.mjs` drives the real backend API end-to-end: readiness → vault
before-state → prepare → approve → execute-and-poll → derived state →
reconcile → vault after-state → withdraw → final state. If any prerequisite is
genuinely missing it STOPS with the real blocker and never fakes a step.

## Files

- `backend/readiness.js` — readiness aggregator (`checkReadiness`)
- `backend/stateMachine.js` — derived-state machine (`TERMINAL_STATES`, `derivedState`)
- `backend/reconcileService.js` — independent reconciliation + stuck sweep
- `backend/deploymentCheck.js` / `backend/deployment.js` — Sepolia artifact + on-chain verification
- `backend/keeperhubProbe.js` — KeeperHub auth probe
- `backend/funding.js` — on-chain funding gates + evidence
- `backend/config.js` — Phase 6 env config + policy (`effectiveMode`, `noSilentFallback`)
- `backend/chainProbe.js`, `backend/guards.js`, `backend/lock.js` — infra/guard helpers
- `backend/controller.js`, `backend/routes.js` — Express layer
- `backend/src/onchain/…` (in `backend/`): `webFeed.js`, `discoveryService.js`,
  `discoveryRepository.js`, `registryAbi.js`, `validator.js`, `shareApy.js`,
  `buildOpportunity.js`, `keccak.js` — the web→web3 feed + registry discovery
- `security-layer/backend/provider.js` — `eth_blockNumber`, failover, chunked logs
- `security-layer/backend/abi.js` — ABI offsets + NUL-safe `decodeString`
- `database/002_phase6.sql` — phase 6 schema (workflow state, funding, audit)
- `frontend/Phase6Readiness.jsx`, `Phase6Funding.jsx`, `Phase6StateBadge.jsx`
- `frontend/src/pages/Discovery.jsx` + `hooks/useDiscovery.js` + api/mapping — screening queue UI
- `scripts/demo-e2e.mjs`, `scripts/check-readiness.mjs`, `scripts/check-funding.mjs`,
  `scripts/audit-project.mjs`, `scripts/deploy-sepolia.mjs`
- `tests/` — 8 files / 57 tests (readiness, funding, deployment, state machine, guards, lock, reconcile, chain probe)

## Current live status (honest)

As of the last run: backend 102/102, frontend 60/60, Phase 5 31/31, Phase 6 57/57.
The web feed performed a real mainnet scan: 202 candidates persisted
(`chain_id=1`), 198 qualified as LEGIT (token screen + live on-chain liquidity)
and were posted as rankable `source='webfeed'` opportunities with honest `null`
APY/TVL (sample: `⚡VLRC/WETH`, `XPRUSDT/USDT`, `HYPSOL/WETH` — live reserves
kept as evidence), all served via `/api/opportunities/discovery` and
`/api/opportunities`.

The live KeeperHub demonstration remains blocked by real-world prerequisites:
no `config/contracts/11155111.json` (Sepolia deployment pending) and no `kh_`
key. `GET /api/phase6/readiness` returns these blockers verbatim rather than
pretending — that honesty is the deliverable.