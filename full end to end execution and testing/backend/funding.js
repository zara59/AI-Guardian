// Phase 6: execution-wallet funding + allocation gate.
//
// Before KeeperHub can move value, the execution wallet must be:
//   - configured (KeeperHub wallet address present + valid)
//   - funded (enough Sepolia ETH for gas)
//   - holding the required test asset for a deposit
//   - allowed (approve(gToken) allowance to the vault for a deposit)
//
// Every balance/allowance is READ ON-CHAIN from Sepolia. Nothing is assumed.
// The UI distinguishes (Phase 6 §5):
//   not_configured | wallet_invalid | deployment_missing | chain_unreachable
//   insufficient_gas | insufficient_token_balance | insufficient_allowance
//   ready
//
// For a KeeperHub-executed withdrawal the relevant "allocation" is the USER's
// vault-share allowance to the KeeperHub wallet (ERC-4626 withdraw burns the
// owner's shares). We read that too and report it truthfully.

import { getPhase6Config } from './config.js';
import { getConfig } from '../../keeper hub integration/backend/config.js';
import { loadSepoliaContracts } from './deploymentCheck.js';
import {
  probeNativeBalance,
  probeTokenBalance,
  probeAllowance,
  probeChain,
} from './chainProbe.js';
import { fromRaw } from '../../security-layer/backend/amounts.js';
import { isAddress } from '../../backend/src/config/networks.js';

const ETH = 10n ** 18n;
const WEI_PER_GWEI = 10n ** 9n;

/**
 * Human-readable ETH wei → decimal string (managed here to avoid a second
 * fromRaw dependency for native ETH).
 */
function weiEth(wei) {
  const w = wei ?? 0n;
  const whole = w / ETH;
  const frac = w % ETH;
  return `${whole}.${frac.toString().padStart(18, '0').replace(/0+$/, '')}`;
}

/**
 * Run the funding/allocation check for a workflow or a generic wallet check.
 *
 * @param {object} opts
 * @param {string} [opts.walletAddress] — execution wallet (defaults to config)
 * @param {string} [opts.tokenAddress] — asset token (defaults to artifact)
 * @param {string} [opts.vaultAddress]
 * @param {string} [opts.amountRaw] — required raw amount (base units)
 * @param {string} [opts.operation] — deposit | withdraw | approve
 * @param {object} [deps] — injectable for tests
 * @returns {Promise<{state: string, ready: boolean, detail: string, evidence: object}>}
 */
export async function checkExecutionFunding(opts = {}, deps = {}) {
  const p6 = deps.getPhase6Config ? deps.getPhase6Config() : getPhase6Config();
  const phase5 = deps.getConfig ? deps.getConfig() : getConfig();
  const loadContracts =
    deps.loadSepoliaContracts || loadSepoliaContracts;
  const probeChainFn = deps.probeChain || probeChain;
  const balanceFns = deps.balanceFns || {
    native: probeNativeBalance,
    token: probeTokenBalance,
    allowance: probeAllowance,
  };

  const walletAddress = opts.walletAddress || phase5.walletAddress;

  // 1. Configured?
  if (!walletAddress) {
    return result('not_configured', false, 'KEEPERHUB_WALLET_ADDRESS is not set.', {});
  }
  if (!isAddress(walletAddress)) {
    return result('wallet_invalid', false, 'KEEPERHUB_WALLET_ADDRESS is not a valid address.', { walletAddress });
  }

  // 2. Chain really is Sepolia?
  const chain = await probeChainFn();
  if (!chain.ok) {
    return result(
      'chain_unreachable',
      false,
      `Could not confirm Sepolia chain id (got ${chain.chainId ?? 'unknown'}). Check SEPOLIA_RPC_URL.`,
      { chain },
    );
  }

  // 3. Contracts deployed so the wallet has something to fund?
  const contracts = await loadContracts();
  if (!contracts) {
    return result(
      'deployment_missing',
      false,
      'No Guardian deployment artifact for Sepolia; cannot verify wallet funding without token/vault addresses.',
      { walletAddress, chainId: chain.chainId },
    );
  }
  const tokenAddress = opts.tokenAddress || contracts.token.address;
  const vaultAddress = opts.vaultAddress || contracts.vault.address;
  const decimals = contracts.token.decimals;

  // 4. Read real balances/allowances.
  const nativeWei = await balanceFns.native(walletAddress);
  const tokenBalRaw = await balanceFns.token(walletAddress, tokenAddress);
  const tokenAllowanceRaw = await balanceFns.allowance(walletAddress, tokenAddress, vaultAddress);

  const evidence = {
    walletAddress: walletAddress.toLowerCase(),
    tokenAddress: tokenAddress.toLowerCase(),
    vaultAddress: vaultAddress.toLowerCase(),
    tokenDecimals: decimals,
    nativeWei: nativeWei ?? null,
    nativeEth: nativeWei != null ? weiEth(BigInt(nativeWei)) : null,
    tokenBalanceRaw: tokenBalRaw ?? null,
    tokenBalanceHuman: tokenBalRaw != null ? fromRaw(BigInt(tokenBalRaw), decimals) : null,
    tokenAllowanceRaw: tokenAllowanceRaw ?? null,
    tokenAllowanceHuman: tokenAllowanceRaw != null ? fromRaw(BigInt(tokenAllowanceRaw), decimals) : null,
    minGasWei: p6.minGasWei,
    minGasEth: weiEth(BigInt(p6.minGasWei)),
  };

  const operation = opts.operation || 'deposit';
  const amount = opts.amountRaw ? BigInt(opts.amountRaw) : null;

  if (nativeWei == null || tokenBalRaw == null) {
    return result(
      'chain_unreachable',
      false,
      'Balance reads returned no data (RPC failed?). No funding conclusion is possible.',
      evidence,
    );
  }

  const native = BigInt(nativeWei);
  const minGas = BigInt(p6.minGasWei);

  // 5. Gas.
  if (native < minGas) {
    return result(
      'insufficient_gas',
      false,
      `KeeperHub wallet native balance is ${evidence.nativeEth} ETH (${nativeWei} wei), below the ${evidence.minGasEth} ETH gate. Fund it with Sepolia ETH for gas.`,
      evidence,
    );
  }

  // 6. Asset + allowance.
  const tokenBalance = BigInt(tokenBalRaw);
  if (operation === 'deposit' && amount != null && tokenBalance < amount) {
    return result(
      'insufficient_token_balance',
      false,
      `KeeperHub wallet holds ${evidence.tokenBalanceHuman} of ${decimals}-decimal token but the workflow requires ${fromRaw(amount, decimals)}.`,
      evidence,
    );
  }
  if (operation === 'deposit' && amount == null && tokenBalance <= 0n) {
    return result(
      'insufficient_token_balance',
      false,
      'KeeperHub wallet holds no test asset. fund it with gTEST before a deposit.',
      evidence,
    );
  }

  const allowance = BigInt(tokenAllowanceRaw || '0');
  if (operation === 'deposit' && amount != null && allowance < amount) {
    return result(
      'insufficient_allowance',
      false,
      `KeeperHub wallet allowance to the vault is ${evidence.tokenAllowanceHuman} but the deposit needs ${fromRaw(amount, decimals)}. Approve the vault first.`,
      evidence,
    );
  }

  // 7. Withdrawal share-allocation read (informational + gating).
  // The vault receipt-share OWNER is the user (receiver of the deposit), so
  // withdrawal checks read the OWNER's shares + the allowance the owner has
  // granted the KeeperHub wallet.
  const shareOwner = opts.ownerAddress || walletAddress;
  let shareState = null;
  if (operation === 'withdraw') {
    shareState = await readWithdrawAllocation(
      shareOwner,
      walletAddress,
      vaultAddress,
      tokenAddress,
      amount,
      decimals,
      balanceFns,
    );
    evidence.withdraw = { owner: shareOwner.toLowerCase(), ...shareState };
    if (shareState.state === 'insufficient_allowance') {
      return result(
        'insufficient_allowance',
        false,
        shareState.detail,
        evidence,
      );
    }
  }

  return result('ready', true, 'Execution wallet is configured and funded for this operation.', evidence);
}

async function readWithdrawAllocation(owner, executor, vaultAddress, tokenAddress, amount, decimals, balanceFns) {
  const sharesOf = await balanceFns.token(owner, vaultAddress).catch(() => null);
  if (sharesOf == null) {
    return {
      state: 'unknown',
      sharesRaw: null,
      detail: 'Could not read vault receipt-share balance; withdrawal allocation unconfirmed.',
    };
  }
  const shares = BigInt(sharesOf);
  if (amount != null && shares < amount) {
    return {
      state: 'insufficient_shares',
      sharesRaw: shares.toString(),
      detail: `User vault receipt shares (${fromRaw(shares, decimals)}) are below the requested withdrawal amount.`,
    };
  }
  // KeeperHub executing withdraw(assets, receiver, owner) burns the OWNER's
  // shares, so the owner must grant the KeeperHub wallet share-allowance.
  const shareAllowance = await balanceFns.allowance(owner, vaultAddress, executor).catch(() => null);
  if (amount != null && shareAllowance != null && BigInt(shareAllowance) < amount) {
    return {
      state: 'insufficient_allowance',
      sharesRaw: shares.toString(),
      shareAllowanceRaw: shareAllowance,
      detail: `The vault-share owner (${owner}) has not approved the KeeperHub wallet (${executor}) for enough shares to withdraw. Approve shares first.`,
    };
  }
  return {
    state: 'ready',
    sharesRaw: shares.toString(),
    shareAllowanceRaw: shareAllowance == null ? null : shareAllowance.toString(),
    detail: 'Withdrawal allocation available.',
  };
}

function result(state, ready, detail, evidence) {
  return { state, ready, detail, evidence, checkedAt: new Date().toISOString() };
}

/**
 * Persist a funding check result onto a workflow record (via the Phase 5
 * repository). Only the classification + timestamp are stored — no balances.
 */
export async function persistFundingCheck(repository, workflowId, funding) {
  if (!repository || !workflowId) return;
  await repository.updateByWorkflowId(workflowId, {
    fundingState: funding.state,
    fundingCheckedAt: new Date(),
  });
}

/** gwei helper for diagnostics. */
export function gwei(wei) {
  return `${(BigInt(wei) / WEI_PER_GWEI).toString()} gwei`;
}