// Phase 6: deployment artifact + on-chain verification (read-only).
//
// Loads the authoritative chain artifact (security-layer/config/contracts/
// <chainId>.json) and independently confirms, against a live Sepolia RPC:
//   - chain id is 11155111
//   - every contract address carries bytecode (real deployment)
//   - token decimals match what the application assumes (6)
//
// This is what the UI consults before ever claiming a deployment exists. If
// any part is missing or wrong, `deployed` is false and the reason is real.

import { getDeployment, getGuardianContracts } from '../../security-layer/backend/registry.js';
import { probeChain, probeContractDeployed, probeDeployment } from './chainProbe.js';
import { loadNetworks } from '../../backend/src/config/networks.js';

const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Full deployment verification for Sepolia.
 * @param {object} [deps] — injectable for tests
 * @returns {Promise<object>}
 */
export async function verifySepoliaDeployment(deps = {}) {
  const getDeploymentFn = deps.getDeployment || getDeployment;
  const probe = deps.probeDeployment || probeDeployment;
  const { all } = deps.loadNetworks || loadNetworks;

  const deployment = await getDeploymentFn(SEPOLIA_CHAIN_ID);
  if (!deployment) {
    return {
      chainId: SEPOLIA_CHAIN_ID,
      deployed: false,
      reason: 'NOT_DEPLOYED',
      detail: `No deployment artifact at config/contracts/${SEPOLIA_CHAIN_ID}.json. Run scripts/deploy-sepolia.mjs after funding the deployer.`,
      artifact: null,
    };
  }

  const onChain = await probe(deployment);

  // Expected token decimals are part of the artifact; the artifact must
  // match the on-chain contract.
  let decimalsOk = null;
  const expectedDecimals = deployment.contracts?.GuardianTestToken?.decimals;
  if (onChain.contracts?.token?.decimals && expectedDecimals != null) {
    decimalsOk = Number(onChain.contracts.token.decimals) === Number(expectedDecimals);
  }

  // Vault strategy + supported-token confirmation (access-control sanity).
  let strategyOk = null;
  let tokenSupported = null;
  const vaultState = onChain.contracts?.vault?.state;
  const strategy = deployment.contracts?.GuardianSimpleStakingStrategy;
  if (vaultState?.error) {
    strategyOk = 'unreadable';
    tokenSupported = null;
  } else if (vaultState && strategy) {
    strategyOk =
      typeof vaultState.strategy === 'string' &&
      vaultState.strategy.toLowerCase() === strategy.address.toLowerCase();
    tokenSupported = typeof vaultState.tokenSupported === 'boolean' ? vaultState.tokenSupported : null;
  }

  const gate = [
    onChain.chain?.ok === true,
    onChain.contracts?.token?.deployed === true,
    onChain.contracts?.strategy?.deployed === true,
    onChain.contracts?.vault?.deployed === true,
    decimalsOk !== false,
    strategyOk !== false,
  ];
  const readError =
    typeof strategyOk === 'string' ? (vaultState?.error || 'vault state could not be read') : null;

  const faults = [];
  if (onChain.chain?.ok !== true) faults.push(`chain id mismatch (got ${onChain.chain?.chainId})`);
  if (onChain.contracts?.token?.deployed !== true) faults.push('GuardianTestToken bytecode missing');
  if (onChain.contracts?.strategy?.deployed !== true) faults.push('GuardianSimpleStakingStrategy bytecode missing');
  if (onChain.contracts?.vault?.deployed !== true) faults.push('GuardianVault bytecode missing');
  if (decimalsOk === null) faults.push('token decimals could not be confirmed on-chain');
  if (decimalsOk === false) faults.push(`token decimals on-chain (${onChain.contracts?.token?.decimals}) != artifact (${expectedDecimals})`);
  if (strategyOk === false) faults.push('vault.strategy() does not match the artifact strategy address');
  if (readError) faults.push(`vault state could not be read: ${readError}`);
  if (vaultState?.paused === true) faults.push('vault is paused');
  if (tokenSupported === false) faults.push('vault.report supportedTokens(asset) is false');

  return {
    chainId: SEPOLIA_CHAIN_ID,
    deployed: gate.every(Boolean) && faults.length === 0,
    reason: gate.every(Boolean) && faults.length === 0 ? 'VERIFIED' : 'PARTIAL_MISMATCH',
    faults,
    artifact: {
      deployer: deployment.deployer,
      deployedAtBlock: deployment.deployedAtBlock,
      version: deployment.version,
      token: deployment.contracts?.GuardianTestToken?.address,
      strategy: deployment.contracts?.GuardianSimpleStakingStrategy?.address,
      vault: deployment.contracts?.GuardianVault?.address,
    },
    onChain: {
      chain: onChain.chain,
      tokenBytecodeBytes: onChain.contracts?.token?.bytecodeLength ?? null,
      strategyBytecodeBytes: onChain.contracts?.strategy?.bytecodeLength ?? null,
      vaultBytecodeBytes: onChain.contracts?.vault?.bytecodeLength ?? null,
      tokenDecimals: onChain.contracts?.token?.decimals ?? null,
      decimalsOk,
      strategyOk,
      tokenSupported,
      vaultPaused: vaultState?.paused ?? null,
    },
  };
}

/**
 * Convenience: just the authoritative contract addresses + decimals from the
 * registry (used by funding/reconciliation without re-verifying bytecode).
 */
export async function loadSepoliaContracts(deps = {}) {
  const getGuardianFn = deps.getGuardianContracts || getGuardianContracts;
  const contracts = await getGuardianFn(SEPOLIA_CHAIN_ID);
  if (!contracts) return null;
  return contracts;
}