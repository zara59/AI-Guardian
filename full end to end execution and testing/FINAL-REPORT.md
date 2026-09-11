# AI Guardian — Final Report (Phase 6)

**Scope:** take AI Guardian from "ranked opportunity" to "verifiable, live,
chain-aware value movement & discovery" — and finish with an honest, documented
hand-over of what is done, what is tested, and what stays blocked by real-world
prerequisites.

**Headline deliverable of this phase — the web → web3 filter.** The product no
longer trusts a curated list: it surfaces what is *new on the public chain
itself* ("on web") and only ever publishes what survives **on-chain screening +
live liquidity** ("move to web3"). Everything that does not qualify is held in
an honest screening queue. That pipeline *is* the filter.

---

## 1. What was delivered

### 1.1 On-chain self-registration discovery (registry pipeline)

- Reads `GuardianRegistry` events (`StrategyRegistered`) from the chain via
  `eth_getLogs`, validates each registration completely on-chain: strategy is a
  guardian strategy and deployed, vault deployed, `asset()` / `strategy()`
  match the registration, not paused, token decimals 6–18, readable symbol.
- Computes ERC-4626 share-price APY **only** from Guardian's own historical
  snapshots (≥1 day block distance) — no external oracle, `apy`/`tvlUsd` stay
  `null` when unmeasurable, per the never-fabricate rule.
- Persists per-chain cursor (`discovery_state`) and share samples
  (`opportunity_share_samples`); re-validation failures downgrade the row to
  `eligibility='avoid'` with a `registration-invalidated` flag; only
  `source='curated'` rows are ever removed by staleness pruning.
- **Mainnet registry isn't deployed yet** → the pipeline reports
  `enabled:false` honestly on live chains. The web feed does not depend on it.

### 1.2 The web → web3 feed (this phase's filter)

`backend/src/onchain/webFeed.js` scans the chain for **new pools** —

- Uniswap V2 `PairCreated` and V3 `PoolCreated`, decoded from the full 32-byte
  `keccak256` topic0 (not the 4-byte function selector).
- Every candidate screened web3-true with live RPC: both tokens deployed,
  ERC-20 shape, decimals within 6..18, symbol readable.
- A pool trading the asset of an already Guardian-verified strategy is flagged
  `guardian_linked`.
- **Qualify-then-post**: candidates that pass the token screen AND hold real live
  on-chain liquidity (V2 `getReserves` / V3 `slot0`+`liquidity`, decoded from
  full ABI words — `getReserves` returns *three separate words*, not one packed
  uint256) are POSTED as rankable opportunities (`source='webfeed'`, slug
  `webfeed:{chainId}:{kind}:{pool}`) with honest `null` APY/TVL and the raw
  reserve pair kept as evidence — nothing is invented.
- Candidates persist to `discovery_web_candidates` with honest status
  (`screened` / `flagged` / `pending`), a `posted_slug` marker when posted, and
  the liquidity evidence used to qualify.
- Exposed via `GET /api/opportunities/discovery` (`webfeed.summary` includes a
  `posted` count, `webfeed.candidates` include `postedSlug`) and a new frontend
  **Discovery** page at `/discovery` with a Posted marker + liquidity chips.

### 1.3 Live-RPC hardening (found by going live, not by theorizing)

- `eth_blockNumber` (standard) replaced `eth_getBlockNumber`, which several
  public providers reject (`-32601`).
- Failover: every call routes through `rpcCallThroughNetwork` (primary +
  `fallbackRpcUrls`) — primary hard failures no longer take the pipeline down.
- Chunked `eth_getLogs` (5,000 blocks/chunk) with bounded retries/timeouts
  because free RPCs cap range sizes (50–10k blocks).
- **ABI `decodeString` fix**: the offset word was being misread as the length
  (symbols decoded to NUL-filled garbage) and those NUL bytes were rejected by
  Postgres `jsonb` (`unsupported Unicode escape sequence` failed **every**
  insert — the exact bug this phase hunted down and fixed). `decodeString` now
  follows the ABI offset scheme and strips NULs.

### 1.4 Phase 6 execution / hardening layer

- Readiness aggregator (`/api/phase6/readiness`): deployment artifact + on-chain
  bytecode, KeeperHub `kh_` auth, execution-wallet funding gates, and execution
  policy (`noSilentFallback`). `ready` is one verdict; blockers are returned
  verbatim.
- Derived state machine (draft → ranked → approved → executing → confirmed →
  verified with terminal failed/rejected/expired/invalidated) — the UI and
  audit trail always agree.
- Independent reconciliation (`/api/phase6/reconcile/:id`) + stuck-workflow
  sweep (`/api/phase6/reconcile/stuck`).
- Live `vault-state` reads via RPC, funding evidence, audit endpoint.

### 1.5 Frontend

- Opportunity provenance: "On-chain · self-registered" badge + detail block
  (registered date, strategy contract, project page, chain-aware explorer).
- New **Discovery** page: screening-queue summary + rows (status pills, token
  checks, pool explorer links, flagged-only toggle).

---

## 2. Verification (all green, re-run after final changes)

| Suite | Count | Result |
| --- | --- | --- |
| Backend unit/API (`backend`, `npm test`) | 102 | ✅ 102 pass |
| Frontend (`frontend`, `npm test`) | 60 | ✅ 60 pass · build OK · lint = known `set-state-in-effect` warnings only (pre-existing pattern) |
| Phase 5 KeeperHub (`keeper hub integration`) | 31 | ✅ 31 pass |
| Phase 6 execution/testing (`full end to end…`, `npm test`) | 57 | ✅ 57 pass |

Additions this phase: `onchain.test.js` (19: keccak vectors, decoders, APY
samples, opportunity builder), `webFeed.test.js` (16: V2/V3 decode, **dual-word
`getReserves`/`slot0` ABI decoding**, liquidity classifier, NUL-safe
`decodeString` regression), `mapping.test.js` +4 (web-feed mapping incl. posted
legit candidates).

Live evidence produced from a real mainnet scan (20k-block window, honest cap):

```
pairs: 327 · pools: 81 → 202 candidates screened, 0 flagged, 0 guardian-linked
198/202 qualified as LEGIT (token screen + live on-chain liquidity) and were
POSTED as rankable source='webfeed' opportunities (e.g. ⚡VLRC/WETH,
XPRUSDT/USDT, HYPSOL/WETH) with honest null APY/TVL + raw reserve evidence
GET /api/opportunities/discovery → webfeed.summary {posted: 198} + candidates
GET /api/opportunities             → 201 rows (3 curated + 198 webfeed)
```

---

## 3. Honest status of the Phase 6 mission ("can value move right now?")

`GET /api/phase6/readiness` today returns `ready:false` with these real blockers,
returned verbatim rather than masked:

1. **No Sepolia deployment artifact** —
   `No deployment artifact at config/contracts/11155111.json. Run
   scripts/deploy-sepolia.mjs after funding the deployer.`
2. **No KeeperHub key configured** —
   `KEEPERHUB_API_KEY is not set (must start with kh_).`

Because those prerequisites are genuinely missing:

- Funding probe is `skipped` (can't verify balances of a contract that isn't
  verified on-chain).
- `executionMode` falls back to `direct`, `KEEPERHUB_EXECUTION_REQUIRED` is off,
  and **no silent fallback** policy is enforced.
- The 57-test phase-6 suite covers readiness/funding/deployment/state-machine/
  guard/lock/reconcile **hermetic behavior** (with injectable deps), not a live
  KeeperHub execution, which would fabricate evidence.

**This honesty is the deliverable.** The system refuses to show a fake
"demo complete" when the world depends on two external facts. The exact same
code path, once ① contracts are deployed to Sepolia and ② a `kh_` key exists,
runs `scripts/demo-e2e.mjs` end-to-end reals (readiness → vault before →
prepare → approve → execute-and-poll → reconcile → vault after → withdraw).

---

## 4. Project layout (Phase 6-relevant)

```
ai-guardian/
├── security-layer/backend/{provider,abi,registry,…}.js   RPC + failover + decoding
├── security-layer/config/contracts/11155111.json          ← deploy target (absent → honest blocker)
├── backend/
│   ├── src/onchain/ webFeed, discoveryService, discoveryRepository,
│   │                registryAbi, validator, shareApy, buildOpportunity, keccak
│   ├── src/controllers/opportunityController.js            discovery + webfeed endpoint
│   └── src/repositories/opportunityRepository.js           findOnChainAssets (guardian linking)
├── frontend/src/pages/Discovery.jsx  + hooks/useDiscovery + api/mapping
├── keeper hub integration/            Phase 5 KeeperHub execution (31 tests)
└── full end to end execution and testing/
    ├── backend/{readiness,stateMachine,reconcileService,deployment,keeperhubProbe,funding,…}
    ├── scripts/{demo-e2e,check-readiness,check-funding,audit-project,deploy-sepolia,}.mjs
    └── tests/                          8 files / 57 tests
```

---

## 5. Recommendations / next actions (exact, actionable)

1. **Deploy to Sepolia.** Fund the deployer with Sepolia ETH, run
   `npm run deploy` in `full end to end execution and testing/`, confirm
   `config/contracts/11155111.json` appears and `verifySepoliaDeployment()`
   passes (bytecode + chain id + decimals).
2. **Configure KeeperHub.** Set `KEEPERHUB_API_KEY` (must start `kh_`),
   optionally `KEEPERHUB_WALLET_ADDRESS`; confirm `/api/phase6/readiness`
   shows `keeperhub.authenticated:true`.
3. **Fund the execution wallet** with Sepolia ETH (gas) + gTEST (deposit
   asset); re-check `/api/phase6/funding` gates.
4. **Run the demo**: `node scripts/demo-e2e.mjs --opportunity 1 --wallet 0x… --amount 100`.
5. **Deploy the Guardian contracts to mainnet and re-run the web feed**: the
   registry pipeline then enables itself (`enabled:true`) and `guardian_linked`
   starts flagging pools for verified assets on the same code path.

Every step above changes only *real-world state*; no product code change is
required to go from the current honest "not ready" to a live demonstration.