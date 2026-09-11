# On-chain Guardianship registries

Backend-only, authoritative contract addresses for the Phase 4 bridge. Each
file is named `<chainId>.json` and is written from the output of the Foundry
deploy script (`security-layer/contracts/script/Deploy.s.sol`).

- `1.json` — Ethereum mainnet (in production this holds the real strategies).
- `11155111.json` — Sepolia (Phase 4 demonstration deployment).

The backend loads these via `security-layer/backend/registry.js` and refuses to
prepare transactions for any chain without an artifact. Format:

```json
{
  "chainId": 11155111,
  "network": "sepolia",
  "deployer": "0x...",
  "deployedAtBlock": 1234567,
  "version": "4.0.0",
  "contracts": [
    { "name": "GuardianTestToken", "address": "0x...", "decimals": 6 },
    { "name": "GuardianSimpleStakingStrategy", "address": "0x..." },
    { "name": "GuardianVault", "address": "0x..." }
  ]
}
```

No secrets live here — addresses are public by design.