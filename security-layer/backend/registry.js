// Authoritative on-chain Guardian contract registry for the Phase 4 bridge.
//
// Loads the per-chain deployment artifact produced by the Foundry deploy
// script (security-layer/config/contracts/<chainId>.json). The backend NEVER
// guesses or hardcodes contract addresses: every prepared transaction and every
// chain read uses these values. If a chain has no deployment artifact,
// preparation is refused (503) — no falling back to "some address".

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAddress, loadNetworks } from '../../backend/src/config/networks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR =
  process.env.GUARDIAN_CONTRACTS_DIR ||
  path.resolve(__dirname, '../config/contracts');

let cache = null;

const KNOWN_CONTRACTS = ['GuardianTestToken', 'GuardianSimpleStakingStrategy', 'GuardianVault', 'GuardianRegistry'];

function artifactPath(chainId) {
  return path.join(ARTIFACTS_DIR, `${chainId}.json`);
}

/**
 * Parse + validate one deployment artifact. Chain id must match the filename
 * and every contract entry must be a valid address.
 */
function normalizeArtifact(chainId, raw) {
  const numeric = Number(raw?.chainId);
  if (numeric !== Number(chainId)) {
    throw new Error(`deployment artifact chainId mismatch for ${chainId}`);
  }
  if (!Array.isArray(raw?.contracts)) {
    throw new Error(`deployment artifact ${chainId} is missing "contracts"`);
  }
  const contracts = {};
  for (const entry of raw.contracts) {
    if (!KNOWN_CONTRACTS.includes(entry?.name)) {
      throw new Error(`unknown contract "${entry?.name}" in artifact ${chainId}`);
    }
    if (!isAddress(entry?.address)) {
      throw new Error(`invalid address for ${entry?.name} in artifact ${chainId}`);
    }
    contracts[entry.name] = { address: entry.address, name: entry.name };
    if (Number.isInteger(entry?.decimals)) {
      contracts[entry.name].decimals = entry.decimals;
    }
  }
  return {
    chainId: numeric,
    network: raw.network || String(numeric),
    deployer: raw.deployer || null,
    deployedAtBlock: Number(raw.deployedAtBlock) || null,
    contracts,
    version: raw.version || 'unknown',
  };
}

/**
 * Load the deployment artifacts for every configured chain once.
 * Chains without an artifact are simply left out of the registry (preparation
 * against them is refused later).
 * @returns {Promise<Map<string, object>>} chain id -> artifact
 */
export async function loadContractRegistry() {
  if (cache) return cache;
  const registry = new Map();
  const { all } = await loadNetworks();

  for (const network of all()) {
    try {
      const raw = JSON.parse(await readFile(artifactPath(network.chainId), 'utf8'));
      const artifact = normalizeArtifact(network.chainId, raw);
      registry.set(String(network.chainId), artifact);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        continue;
      }
      throw err;
    }
  }
  cache = registry;
  return cache;
}

/**
 * Get the deployment for a chain, or null if this chain is not deployed.
 * @returns {Promise<object|null>}
 */
export async function getDeployment(chainId) {
  const registry = await loadContractRegistry();
  return registry.get(String(chainId)) || null;
}

/**
 * Get the Guardian contract addresses for a chain.
 * @returns {Promise<{deployment, token: {address, decimals}, strategy: {address}, vault: {address}} | null>}
 */
export async function getGuardianContracts(chainId) {
  const deployment = await getDeployment(chainId);
  if (!deployment) return null;
  const token = deployment.contracts.GuardianTestToken;
  return {
    deployment,
    token: {
      address: token.address,
      decimals: token.decimals ?? 18,
    },
    strategy: deployment.contracts.GuardianSimpleStakingStrategy,
    vault: deployment.contracts.GuardianVault,
  };
}

/**
 * Get the on-chain GuardianRegistry address for a chain, or null when the
 * chain has no discovery registry deployment. This is the self-serve index the
 * opportunity discovery pipeline reads (filter-for-web3).
 * @returns {Promise<{{address: string}|null>}
 */
export async function getGuardianRegistry(chainId) {
  const deployment = await getDeployment(chainId);
  if (!deployment) return null;
  const entry = deployment.contracts.GuardianRegistry;
  if (!entry) return null;
  return { address: entry.address, deployedAtBlock: deployment.deployedAtBlock };
}

// Test seam: wipe the load-once cache so suites can point the registry at
// fresh fixtures.
export function resetContractRegistryForTests() {
  cache = null;
}