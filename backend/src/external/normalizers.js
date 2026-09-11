// Normalization + validation layer.
// Every piece of external data is validated here BEFORE it can enter the
// ranking engine. Malformed provider responses are rejected with a typed
// error (mirroring ProviderError), never silently forwarded.

import { ProviderError } from '../utils/http.js';
import { isAddress } from '../config/networks.js';

function num(value, { min = 0, max = null, allowNull = true } = {}) {
  if (value === null || value === undefined || value === '') {
    return allowNull ? null : undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return allowNull ? null : undefined;
  }
  if (n < min) return allowNull ? null : undefined;
  if (max !== null && n > max) return allowNull ? null : undefined;
  return n;
}

/**
 * Validate and normalize a DefiLlama yield pool record.
 * @throws {ProviderError} when the record is unusable.
 */
export function normalizePool(raw, poolId) {
  if (!raw || typeof raw !== 'object') {
    throw new ProviderError('Malformed pool record', {
      provider: 'decentralized-llama',
      kind: 'invalid-response',
    });
  }
  if (raw.id && raw.id !== poolId) {
    throw new ProviderError('Pool id mismatch', {
      provider: 'decentralized-llama',
      kind: 'invalid-response',
    });
  }
  const symbols = raw.symbol;
  const chain = raw.chain;
  if (typeof symbols !== 'string' || !symbols) {
    throw new ProviderError('Pool missing symbol', {
      provider: 'decentralized-llama',
      kind: 'invalid-response',
    });
  }
  const apy = num(raw.apy);
  const apyBase = num(raw.apyBase);
  const tvlUsd = num(raw.tvlUsd);
  if (apy === undefined || tvlUsd === undefined) {
    throw new ProviderError('Pool missing numeric apy/tvlUsd', {
      provider: 'decentralized-llama',
      kind: 'invalid-response',
    });
  }
  return {
    id: raw.id,
    symbol: symbols,
    chain,
    apy,
    apyBase,
    tvlUsd,
    rewardTokens: Array.isArray(raw.rewardTokens) ? raw.rewardTokens : [],
    poolMeta: raw.poolMeta || null,
    ilRisk: raw.ilRisk ?? null,
  };
}

/**
 * Validate and normalize a map of token prices.
 * Accepts both the raw provider shape ({id: {usd: n}}) and the provider's
 * already-flattened shape ({id: n}). Invalid entries are dropped.
 */
export function normalizePrices(raw, ids) {
  const out = {};
  for (const id of ids) {
    const entry = raw?.[id];
    const price = num(entry?.usd ?? entry);
    if (price !== null && price !== undefined && price > 0) {
      out[id] = price;
    }
  }
  return out;
}

/**
 * Validate and normalize an on-chain inspection result.
 * @param {{network, chainId, contract, tokenDecimals, checks}} raw
 */
export function normalizeInspection(raw) {
  if (!raw) return null;
  const result = {
    network: raw.network || null,
    chainId: raw.chainId !== undefined && raw.chainId !== null ? Number(raw.chainId) : null,
    contractDeployed: raw.contract ? Boolean(raw.contract.deployed) : null,
    contractCodeLength:
      raw.contract && Number.isFinite(Number(raw.contract.bytecodeLength))
        ? Number(raw.contract.bytecodeLength)
        : null,
    tokenDecimals:
      Number.isInteger(raw.tokenDecimals) ? raw.tokenDecimals : null,
    checks: raw.checks || {},
  };
  if (result.contractDeployed !== null && result.contractDeployed === false) {
    // A configured contract address that holds no bytecode is a hard problem.
    result.rejection = 'contract-not-deployed';
  }
  return result;
}

/** Validate a 0x address. Throws when malformed. */
export function requireValidAddress(address, label) {
  if (!isAddress(address)) {
    throw new ProviderError(`Invalid ${label} address: ${address}`, {
      provider: 'registry',
      kind: 'invalid-response',
    });
  }
  return address.toLowerCase();
}

/**
 * Assert a registry opportunity definition is structurally valid.
 * Rejects registry drift before it can poison the pipeline.
 */
export function validateOpportunityDefinition(def) {
  const required = [
    'slug', 'name', 'protocol', 'category', 'network', 'chainId',
    'asset', 'contractAddress', 'defiLlamaProject', 'defiLlamaPoolId',
  ];
  for (const field of required) {
    if (def[field] === undefined || def[field] === null || def[field] === '') {
      throw new ProviderError(`Opportunity definition missing '${field}'`, {
        provider: 'registry',
        kind: 'invalid-response',
      });
    }
  }
  requireValidAddress(def.contractAddress, 'contract');
  if (def.assetAddress) requireValidAddress(def.assetAddress, 'asset');
  if (!Number.isInteger(Number(def.chainId)) || Number(def.chainId) <= 0) {
    throw new ProviderError(`Invalid chainId for ${def.slug}`, {
      provider: 'registry',
      kind: 'invalid-response',
    });
  }
  return def;
}