# AI Guardian — Web3 Data Layer (Phase 3)

This folder is the **source of truth for the Web3 data layer**.

- `networks.json` — supported blockchain networks and their RPC configuration.
- `opportunities.json` — the registry of **real opportunities** Guardian discovers
  and analyzes (real protocols, real contracts, real provider pool identifiers).
- `data-sources.md` — the data-source plan: providers, RPC, security stance,
  data-freshness policy and the honesty rules Phase 3 follows.

The backend loads `networks.json` and `opportunities.json` at runtime
(`backend/src/external/`). Nothing here is mocked. Every value that can come
from a live source (yield, TVL, token price, contract existence, decimals)
comes from a live source; anything that cannot be verified is marked
`unavailable` / `unknown` / `verification-incomplete` — never invented.