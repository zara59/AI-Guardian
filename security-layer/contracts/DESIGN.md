# Guardian Contracts — Phase 4 Design

This document captures _why_ the Phase 4 contract set exists, how it is scoped,
and the exact trust boundaries. It is the security reference for the bridge:
**ranked opportunity → connected wallet → GuardianVault → strategy → on-chain
value**.

---

## 1. Threat model / motivation

The previous phases proved the system can *rank* opportunities on the backend
and display them in the UI. Phase 4 adds real value movement. The danger of
adding execution is that "the backend knows where you should invest" becomes
"the backend can move your money". We reject that.

Hard constraints (the property list that cannot change):

1. **No arbitrary execution.** The vault can call exactly two external
   functions on exactly one allowlisted contract.
2. **No admin asset movement.** The vault's owner configures and pauses; it
   cannot withdraw a single base unit of user funds.
3. **No standing allowances.** Allowance to the strategy is set to the exact
   amount, used once, and reset to zero.
4. **All-or-nothing.** A failed strategy call reverts the entire deposit or
   withdraw — no partial state, no loss.
5. **Share math, not pools.** Every user's ownership is their ERC-4626 receipt
   shares. Nobody "owns" the strategy balance.

## 2. Contract set

| Contract | File | Responsibility |
|---|---|---|
| `GuardianVault` | `src/GuardianVault.sol` | ERC-4626 vault; the ONLY user entry point. Deposits route to the allowlisted strategy via `IYieldStrategy.deposit`; withdrawals pull via `IYieldStrategy.withdraw`. |
| `GuardianSimpleStakingStrategy` | `src/strategies/GuardianSimpleStakingStrategy.sol` | Testnet strategy: holds the asset, tracks `staked[token]`, owner-only `donateYield` to simulate protocol rewards. Only the vault may deposit/withdraw. |
| `IYieldStrategy` | `interfaces/IYieldStrategy.sol` | The fixed execution surface (`deposit`, `withdraw`, `balanceOfStaked`, `isGuardianStrategy` marker). |
| `GuardianTestToken` | `mocks/GuardianTestToken.sol` | 6-decimal mintable test asset (forces the whole stack to not assume 18). |
| `ReentrantToken` / `RevertingToken` / `MaliciousStrategy` | `mocks/` | Test adversaries used to prove the failure modes. |

## 3. Execution surface

The vault's only outbound calls (in order of the lifecycle):

```
deposit:  asset.safeTransferFrom(depositor)          // ERC4626 super
          strategy.deposit(asset, assets)             // fixed call
          asset.forceApprove(strategy, 0)             // allowance cleanup

withdraw: strategy.withdraw(asset, assets)            // fixed call
          asset.safeTransfer(receiver)                // ERC4626 super
```

Admin's only powers (all `onlyOwner`):

```
setStrategy(address)    must answer isGuardianStrategy() == true, else revert
setTokenSupported(a, bool)
pause() / unpause()
```

No: arbitrary target, calldata, delegatecall, rescue, backstop admin withdraw,
unlimited allowances, or multi-asset routing.

## 4. Trust boundaries

| Trusted to | Entity | Scope |
|---|---|---|
| On-chain configuration | Vault owner (deployer) | allowlist strategy + asset, pause. **Cannot** touch user balances. |
| Move funds in/out | deposit/withdraw/redeem callers | only own allowance-governed shares. |
| Hold + accrue yield | Strategy contract | funds live here; `totalAssets()` = `strategy.balanceOfStaked(asset())`. |
| Recommend *what* to trade | Backend / ranking | advisory only; the prepared transaction is signed by the user's own wallet. |

**Why the backend cannot steal funds:** it has no key, no allowance, and no
contract call it can make. A user connects their wallet, reviews the prepared
transaction (exact token, exact vault, exact amount, min-margin preview), and
signs it themselves. The backend only ever reads chain state and computes the
target `spendTo`/`amount`.

**Why the strategy cannot steal funds:** it can only ever receive via the vault
(allowance reset to 0 after every call) and can only pay the vault. Its owner
(deployer) can `donateYield` (add value, raising the exchange rate for all
holders) but cannot extract anything.

## 5. User-value accounting (ERC-4626)

- `deposit(assets)` → mints `shares`; user now "owns" their share of the
  strategy balance.
- `totalAssets() == strategy.balanceOfStaked(asset())` — vault never idles.
- Yield (e.g. `donateYield`) raises `previewRedeem(shares)` — a bond/claim
  that is redeemable for assets at any time.
- Withdraw/redeem burn shares and return the corresponding assets, subject
  only to the 1-wei virtual-offset dust that the OpenZeppelin v5 design
  deliberately leaves as inflation-attack protection.

## 6. Failure-mode guarantees (all proven by `test/GuardianVault.t.sol`)

| Scenario | Guarantee |
|---|---|
| Strategy `deposit` reverts | whole transaction reverts; user funds + zero shares |
| Strategy `withdraw` reverts | whole transaction reverts; user shares + funds intact |
| Reentrant asset's `transferFrom` re-enters vault | `ReentrancyGuard` blocks; no shares minted, no double route |
| Asset transfers revert | clean revert; vault & strategy untouched |
| `pause()` active | deposit/withdraw/mint/redeem all revert |
| Arbitrary contract allowlisted | rejected (missing/invalid `isGuardianStrategy`) |
| Admin calls `redeem(alice)` | blocked (no allowance, no rescue function exists) |
| Unsupported token passes frontend bypass | `TokenNotSupported` on-chain check |
| Zero amount | `ZeroAmount` revert |

## 7. Deployment & the rest of the bridge

- `script/Deploy.s.sol` deploys + wires token/strategy/vault and mints E2E
  tokens to the deployer.
- Deployed addresses for Sepolia are recorded in
  `security-layer/config/contracts/sepolia.json` (chain id 11155111), which the
  backend's `security-layer/backend/registry.js` loads as the authoritative
  contract registry. Chains without an artifact are refused at prepare time.
- The backend prepares transactions; the browser wallet signs them; state
  verification (receipts, events, balances, exchange rate) is done via
  read-only RPC calls from the backend and readback in the UI.

Production adapters for real protocols (e.g. Aave, Lido) implement
`IYieldStrategy`; allowlisting them is configuration, not new contract code —
the vault and its invariants stay identical.