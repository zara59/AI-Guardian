// On-chain legitimacy validator for self-registered Guardian opportunities.
//
// Registration in GuardianRegistry is a CLAIM, never a guarantee. This module
// independently re-verifies every entry by reading the live chain — the same
// checks the vault itself enforces when a strategy is installed:
//   - strategy implements Guardian's isGuardianStrategy() = true
//   - vault is an ERC-4626 whose asset() is the registered token
//   - vault.strategy() == the registered strategy (live wiring)
//   - vault is not paused, and if it holds shares, shares are redeemable
//   - token is deployed with a sane decimal scale
// Anything that fails any of these checks is NOT ranked.

import { isAddress } from '../config/networks.js';
import * as blockchainProvider from '../external/blockchainProvider.js';

/**
 * Validate one registration against the live chain.
 * @param {{strategy, vault, token, name, description}} registration
 * @param {{networkId?: string, provider?: object}} deps test seam
 * @returns {Promise<{ok: boolean, reasons: string[], checks: object, codeLengths: object}>}
 */
export async function validateRegistration(registration, deps = {}) {
  const networkId = deps.networkId || 'ethereum';
  const provider = deps.provider || blockchainProvider;

  const reasons = [];
  const checks = {};
  const codeLengths = {};

  const { strategy, vault, token } = registration;
  if (!isAddress(strategy) || !isAddress(vault) || !isAddress(token)) {
    return {
      ok: false,
      reasons: ['Registration contains an invalid strategy/vault/token address.'],
      checks,
      codeLengths,
    };
  }

  const sel = provider.SELECTORS || {};
  const pGetCode = provider.getCode && provider.getCode.bind(provider);
  const pCallBoolean = provider.callBoolean && provider.callBoolean.bind(provider);
  const pCallAddress = provider.callAddress && provider.callAddress.bind(provider);
  const pCallWord = provider.callWord && provider.callWord.bind(provider);

  // 1. all three contracts must be deployed
  for (const [label, addr] of [
    ['strategy', strategy],
    ['vault', vault],
    ['token', token],
  ]) {
    if (!pGetCode) {
      reasons.push(`${label}: provider cannot read code`);
      continue;
    }
    try {
      const c = await pGetCode(networkId, addr);
      checks[`${label}Deployed`] = c.deployed;
      codeLengths[label] = c.bytecodeLength;
      if (!c.deployed) reasons.push(`${label} has no bytecode on-chain (not deployed).`);
    } catch (err) {
      reasons.push(`${label} code read failed: ${err.message}`);
    }
  }

  // 2. the strategy contract carries the Guardian marker
  if (pCallBoolean) {
    try {
      const guardian = await pCallBoolean(networkId, strategy, sel.isGuardianStrategy);
      checks.isGuardianStrategy = guardian;
      if (!guardian) {
        reasons.push('Strategy does not implement isGuardianStrategy() = true.');
      }
    } catch (err) {
      reasons.push(`isGuardianStrategy() read failed: ${err.message}`);
    }
  }

  // 3. vault wiring: asset() == registered token
  if (pCallAddress) {
    try {
      const asset = await pCallAddress(networkId, vault, sel.asset);
      checks.asset = asset;
      if (asset !== token.toLowerCase()) {
        reasons.push(`vault.asset() (${asset}) does not match the registered token.`);
      }
    } catch (err) {
      reasons.push(`vault.asset() read failed: ${err.message}`);
    }
  }

  // 4. vault wiring: strategy() == registered strategy
  try {
    const vaultStrategy = await pCallAddress(networkId, vault, sel.strategy);
    checks.strategy = vaultStrategy;
    if (vaultStrategy !== strategy.toLowerCase()) {
      reasons.push(`vault.strategy() (${vaultStrategy}) != registered strategy.`);
    }
  } catch (err) {
    reasons.push(`vault.strategy() read failed: ${err.message}`);
  }

  // 5. vault must not be paused (deposits closed)
  try {
    const paused = await pCallBoolean(networkId, vault, sel.paused);
    checks.paused = paused;
    if (paused) reasons.push('Vault is paused.');
  } catch (err) {
    checks.paused = null;
  }

  // 6. token sanity
  if (provider.getTokenDecimals) {
    try {
      const decimals = await provider.getTokenDecimals(networkId, token);
      checks.tokenDecimals = decimals;
      if (!Number.isInteger(decimals) || decimals < 6 || decimals > 18) {
        reasons.push(`Token decimals (${decimals}) are outside the sane 6..18 range.`);
      }
    } catch {
      checks.tokenDecimals = null;
      reasons.push('Token decimals() unreadable.');
    }
  }
  if (provider.getTokenSymbol) {
    try {
      const symbol = await provider.getTokenSymbol(networkId, token);
      checks.tokenSymbol = symbol;
      if (!symbol) reasons.push('Token symbol() is empty.');
    } catch {
      checks.tokenSymbol = null;
      reasons.push('Token symbol() unreadable.');
    }
  }

  // 7. exchange-rate sanity: shares must not be worthless
  if (pCallWord) {
    try {
      const supply = await pCallWord(networkId, vault, sel.totalSupply);
      codeLengths.totalSupply = supply.toString();
      checks.totalSupply = supply.toString();
      if (supply > 0n) {
        try {
          const redeem = await pCallWord(networkId, vault, sel.previewRedeem, [
            { type: 'uint256', value: 1n },
          ]);
          checks.previewRedeem = redeem.toString();
          if (redeem === 0n) {
            reasons.push('Vault holds supply but 1 share redeems 0 assets (broken exchange rate).');
          }
        } catch {
          checks.previewRedeem = null;
          reasons.push('previewRedeem(1) unreadable.');
        }
      }
    } catch {
      checks.totalSupply = null;
    }
  }

  return { ok: reasons.length === 0, reasons, checks, codeLengths };
}