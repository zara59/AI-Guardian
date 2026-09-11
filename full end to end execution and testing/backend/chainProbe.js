// Phase 6: real on-chain probe for Sepolia.
//
// All reads here hit a live Ethereum Sepolia RPC (network config in
// security-layer/config/networks.json, overridable with SEPOLIA_RPC_URL).
// Values are real or null — never fabricated. Used by readiness, funding,
// deployment verification and the reconciliation service.

import {
  getChainId,
  getLatestBlock,
  getCode,
  getBalance,
  getTokenBalance,
  getTokenAllowance,
  getTokenDecimals,
  getTransactionReceipt,
  getVaultState,
} from '../../security-layer/backend/provider.js';
import { getNetwork, isAddress } from '../../backend/src/config/networks.js';

const NETWORK_ID = 'sepolia';

/**
 * Confirm the chain we are about to read is really Sepolia.
 * @returns {Promise<{chainId: number, expected: number, ok: boolean, latestBlock: number|null}>}
 */
export async function probeChain() {
  const network = await getNetwork(NETWORK_ID);
  const expected = Number(network.chainId);
  try {
    const chainId = await getChainId(NETWORK_ID);
    let latestBlock = null;
    try {
      latestBlock = await getLatestBlock(NETWORK_ID);
    } catch {
      latestBlock = null;
    }
    return { chainId, expected, ok: chainId === expected, latestBlock };
  } catch (err) {
    return {
      chainId: null,
      expected,
      ok: false,
      latestBlock: null,
      error: err.message,
    };
  }
}

/**
 * Verify a contract actually carries bytecode on-chain at this moment.
 * @returns {Promise<{deployed: boolean, bytecodeLength: number|null, error?: string}>}
 */
export async function probeContractDeployed(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || '')) {
    return { deployed: false, bytecodeLength: null, error: 'Invalid address' };
  }
  try {
    const result = await getCode(NETWORK_ID, address);
    return result;
  } catch (err) {
    return { deployed: false, bytecodeLength: null, error: err.message };
  }
}

/**
 * Probe the deployed GuardianVault deployment point-by-point:
 * chain id, bytecode on all three contracts, real token decimals, core vault
 * state reads (asset/strategy/supported/paused).
 * @param {object} deployment — artifact from security-layer registry
 * @returns {Promise<object>}
 */
export async function probeDeployment(deployment) {
  if (!deployment) {
    return { deployed: false, error: 'No deployment artifact loaded' };
  }
  // Registry artifact keys contracts by contract name; tests may also use the
  // flattened { token, strategy, vault } shape. Accept both.
  const c = deployment.contracts || {};
  const token = c.token || c.GuardianTestToken;
  const strategy = c.strategy || c.GuardianSimpleStakingStrategy;
  const vault = c.vault || c.GuardianVault;

  const chain = await probeChain();
  const [codeToken, codeStrategy, codeVault] = await Promise.all([
    token ? probeContractDeployed(token.address) : Promise.resolve({ deployed: false, bytecodeLength: null }),
    strategy ? probeContractDeployed(strategy.address) : Promise.resolve({ deployed: false, bytecodeLength: null }),
    vault ? probeContractDeployed(vault.address) : Promise.resolve({ deployed: false, bytecodeLength: null }),
  ]);

  let decimals = null;
  if (token && codeToken.deployed) {
    try {
      decimals = await getTokenDecimals(NETWORK_ID, token.address);
    } catch (err) {
      decimals = { error: err.message };
    }
  }

  let vaultState = null;
  if (vault && codeVault.deployed) {
    try {
      vaultState = await getVaultState(NETWORK_ID, {
        vault: vault.address,
        token: token ? token.address : undefined,
        owner: undefined,
      });
    } catch (err) {
      vaultState = { error: err.message };
    }
  }

  return {
    deployed: chain.ok && codeToken.deployed && codeVault.deployed,
    chain,
    contracts: {
      token: { address: token?.address || null, ...codeToken, decimals },
      strategy: { address: strategy?.address || null, ...codeStrategy },
      vault: { address: vault?.address || null, ...codeVault, state: vaultState },
    },
  };
}

/**
 * Read the real native balance of an address on Sepolia.
 * @returns {Promise<string|null>} wei as decimal string, or null on read failure
 */
export async function probeNativeBalance(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || '')) return null;
  try {
    return (await getBalance(NETWORK_ID, address)).toString();
  } catch {
    return null;
  }
}

/**
 * Read the real ERC-20 balance of an address on Sepolia.
 * @returns {Promise<string|null>} raw base-unit balance, or null on failure
 */
export async function probeTokenBalance(address, tokenAddress) {
  if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(address || '')) return null;
  try {
    return (await getTokenBalance(NETWORK_ID, tokenAddress, address)).toString();
  } catch {
    return null;
  }
}

/**
 * Read the real ERC-20 allowance owner → spender on Sepolia.
 * @returns {Promise<string|null>}
 */
export async function probeAllowance(address, tokenAddress, spender) {
  if (!tokenAddress || !spender) return null;
  try {
    return (await getTokenAllowance(NETWORK_ID, tokenAddress, address, spender)).toString();
  } catch {
    return null;
  }
}

/**
 * Read the real transaction receipt for a hash on Sepolia.
 * @returns {Promise<object|null>} null when not yet mined
 */
export async function probeReceipt(txHash) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash || '')) {
    return { error: 'Invalid transaction hash' };
  }
  try {
    const receipt = await getTransactionReceipt(NETWORK_ID, txHash);
    if (!receipt) return null;
    return {
      hash: receipt.hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString() ?? null,
      from: receipt.from,
      to: receipt.to,
      logCount: (receipt.logs || []).length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

export { NETWORK_ID };

/**
 * Read the real GuardianVault state (totalAssets, shares, paused, etc.).
 * @param {object} params — { vault, token?, owner? }
 * @returns {Promise<object|null>}
 */
export async function probeVaultState({ vault, token, owner } = {}) {
  try {
    const state = await getVaultState(NETWORK_ID, {
      vault,
      token: token || undefined,
      owner: isAddress(owner) ? owner : undefined,
    });
    return {
      ...state,
      owner: isAddress(owner) ? owner.toLowerCase() : null,
    };
  } catch (err) {
    return { error: err.message };
  }
}