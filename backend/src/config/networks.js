// Centralized network configuration.
// Loaded once from the Web3 Data folder (networks.json). RPC URLs can be
// overridden with environment variables (e.g. ETHEREUM_RPC_URL), so no RPC
// endpoint is ever scattered through the codebase.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORKS_PATH = path.resolve(
  __dirname,
  '../../../Web3 Data/networks.json',
);

const HEX_CHAIN_ID = /^0x[0-9a-fA-F]+$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

let cached = null;

function normalizeNetwork(raw) {
  if (!raw?.id || !raw?.name) {
    throw new Error(`invalid network entry: missing id/name (${JSON.stringify(raw)})`);
  }
  const chainId = Number(raw.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`invalid network "${raw.id}": chainId must be a positive integer`);
  }
  const HEX = chainId.toString(16);
  if (raw.expectedHexChainId) {
    const expected = String(raw.expectedHexChainId).toLowerCase().replace(/^0x/, '');
    if (expected !== HEX) {
      throw new Error(
        `invalid network "${raw.id}": expected hex chain id ${raw.expectedHexChainId}, got 0x${HEX}`,
      );
    }
  }
  const rpcUrl = process.env[raw.envOverrideRpcUrl] || raw.rpcUrl;
  if (!/^https?:\/\//.test(rpcUrl || '')) {
    throw new Error(`invalid network "${raw.id}": rpcUrl must be an http(s) URL`);
  }
  const fallbacks = (raw.fallbackRpcUrls || [])
    .map(String)
    .filter((u) => /^https?:\/\//.test(u));
  if (!raw.nativeToken?.symbol || !Number.isInteger(raw.nativeToken?.decimals)) {
    throw new Error(`invalid network "${raw.id}": nativeToken requires symbol + integer decimals`);
  }
  return {
    id: raw.id,
    name: raw.name,
    chainId,
    hexChainId: `0x${HEX}`,
    rpcUrl,
    fallbackRpcUrls: fallbacks,
    nativeToken: { symbol: raw.nativeToken.symbol, decimals: raw.nativeToken.decimals },
    explorerUrl: raw.explorerUrl || null,
  };
}

/** Validate a 0x..40 address. */
export function isAddress(value) {
  return typeof value === 'string' && ADDRESS.test(value);
}

/**
 * Load (once) and validate the network configuration from Web3 Data/networks.json.
 */
export async function loadNetworks() {
  if (cached) return cached;

  const raw = JSON.parse(await readFile(NETWORKS_PATH, 'utf8'));
  const networks = (raw?.networks || []).map(normalizeNetwork);
  if (!networks.length) {
    throw new Error('networks.json must define at least one network');
  }

  const byId = new Map(networks.map((n) => [n.id, n]));
  cached = {
    networks,
    byId,
    get: (id) => byId.get(id) || null,
    all: () => networks,
    // True when every configured network's real hex chain id matches the
    // value declared in configuration.
    validateHexChainId(hex) {
      return typeof hex === 'string' && HEX_CHAIN_ID.test(hex);
    },
  };
  return cached;
}

export async function getNetwork(id) {
  const networks = await loadNetworks();
  return networks.get(id);
}