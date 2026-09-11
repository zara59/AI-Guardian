# AI Guardian — Data Source Plan (Phase 3)

## 1. Networks

A single network is integrated in Phase 3 (quality over quantity): **Ethereum Mainnet**.

| Field | Value |
|---|---|
| Network id | `ethereum` |
| Chain ID | `1` |
| Native token | ETH (18 decimals) |
| Explorer | https://etherscan.io |
| RPC | Public endpoint, overridable via `ETHEREUM_RPC_URL` |

RPC URLs are centralized in `networks.json` and can be overridden with
environment variables (`ETHEREUM_RPC_URL`). No private RPC credentials are
committed anywhere.

## 2. Providers

### 2.1 Blockchain (RPC) — `blockchainProvider.js`
Genuine blockchain read operations against the configured network:
- `eth_chainId` — confirm we talk to the configured chain.
- `eth_blockNumber` — latest block / liveness.
- `eth_getCode` — **contract existence** (bytecode length).
- `eth_getBalance` — native balance of a contract.
- `eth_call` — standard ERC-20 reads: `decimals()` and `totalSupply()`.

No wallet, no signing, no transactions. Every call is read-only.

### 2.2 Protocol / yield — `protocolProvider.js`
Provider: **DefiLlama Yields & Protocols** (public, no API key).
- `https://yields.llama.fi/pools` — real per-pool APY, APY base, reward tokens, TVL.
- `https://api.llama.fi/protocol/{slug}` — protocol-level TVL.

Each registry opportunity references a real DefiLlama `pool` id (`poolId`) and a
protocol slug (`defiLlamaProject`).

### 2.3 Market data — `marketProvider.js`
Provider: **CoinGecko** public API (no API key required).
- `GET /api/v3/simple/price` — real USD prices for assets (ETH, USDC).

### 2.4 Security — `securityProvider.js`
No free, reliable, key-less security/audit API is integrated in Phase 3.
Instead the security provider performs **on-chain inspection** (real, via RPC)
and reports the honest status:
- `contractDeployed` — real bytecode check.
- `verificationStatus: verification-incomplete` — Guardian does **not** claim a
  protocol is audited or safe; audit claims are not independently verified by an
  integrated security provider in this phase.

This follows the phase rule: *“Verification incomplete is better than Safe.”*

## 3. Data freshness strategy

Reasonable per-type TTLs (Redis), not one arbitrary TTL:

| Data type | TTL | Notes |
|---|---|---|
| Token price (CoinGecko) | 60s | short |
| Pool yield / APY (DefiLlama) | 300s | medium |
| TVL (DefiLlama) | 900s | longer |
| On-chain inspection (contract exists, decimals) | 3600s | static facts |
| Aggregated opportunity payload (Redis) | 120s | fast reads |

Read paths:
1. Check Redis cache → 2. if valid use → 3. else call provider → 4. validate →
5. normalize → 6. cache → 7. persist normalized data to PostgreSQL → 8. continue.

If Redis fails: continue without cache, fetch directly, log safely (never expose
to the user unnecessarily).

## 4. Honesty rules (non-negotiable)

- Never fabricate a yield, TVL, price, or security claim.
- Missing data → `null` / `unavailable` / `unknown`; never a made-up number.
- A low score from missing data is labeled **insufficient information**, distinct
  from a genuinely low score.
- No wallet, no signatures, no transactions, no KeeperHub, no execution anywhere
  in Phase 3.

## 5. Opportunity pipeline

```
Web3 Data/opportunities.json (registry, real identities)
  → providers (RPC + DefiLlama + CoinGecko)
  → validation + normalization
  → metric rubric (deterministic, documented)
  → data confidence + safety/eligibility evaluation
  → Redis cache + PostgreSQL persist
  → ranking engine (unchanged 100-point framework)
  → backend API → frontend
```