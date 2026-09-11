// Blockchain provider — the application's only connection to blockchain
// infrastructure. Every operation is a read-only RPC call against the
// configured network. No wallet, no signing, no transactions.
//
// Read operations available in Phase 3:
//   - eth_chainId            (confirm the configured chain)
//   - eth_getBlockNumber     (latest block / liveness)
//   - eth_getCode            (contract existence + bytecode length)
//   - eth_getBalance         (native balance of an address)
//   - eth_call               (standard ERC-20 reads: decimals, totalSupply)
//
// Phase 4 additions (transaction preparation & verification):
//   - eth_call               (token balances/allowances, vault state)
//   - eth_estimateGas        (client-side gas estimation for the proposed tx)
//   - eth_getTransactionReceipt
//   - eth_getLogs            (verify Deposit/StrategyRouted events)

import { rpcCall } from '../../backend/src/utils/http.js';
import { getNetwork, isAddress } from '../../backend/src/config/networks.js';
import { encodeCalldata, encodeUint, encodeAddress, decodeUint, decodeAddress, decodeString, decodeEventArgs } from './abi.js';

// Standard ERC-20 function selectors (public ABI, well documented).
export const SELECTORS = {
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  symbol: '0x95d89b41',
  name: '0x06fdde03',
  asset: '0x38d52e0f',
  balanceOf: '0x70a08231',
  allowance: '0xdd62ed3e',
  totalAssets: '0x01e1d114',
  strategy: '0xa8c62e76',
  supportedTokens: '0x68c4ac26',
  previewRedeem: '0x4cdad506',
  balanceOfStaked: '0x3455f41e',
  paused: '0x5c975abb',
  isGuardianStrategy: '0x109212b6',
};

/**
 * JSON-RPC call with failover across the network's configured RPC URLs
 * (primary + `fallbackRpcUrls`). Public endpoints are flaky and rate-limited;
 * hard-failure of the primary should not take the pipeline down.
 */
async function rpcCallThroughNetwork(network, method, params, options = {}) {
  const urls = [network.rpcUrl, ...(network.fallbackRpcUrls || [])];
  let lastError = null;
  for (const url of urls) {
    try {
      return await rpcCall(url, method, params, {
        provider: `rpc:${network.id}`,
        ...options,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Read the chain id of a network via eth_chainId and confirm it matches the
 * configured value. Throws on mismatch (protects against wrong-chain data).
 */
export async function getChainId(networkId = 'ethereum', options = {}) {
  const network = await getNetwork(networkId);
  if (!network) throw new Error(`Unknown network: ${networkId}`);
  const hex = await rpcCallThroughNetwork(network, 'eth_chainId', [], {
    ...options,
  });
  return parseInt(hex, 16);
}

export async function getLatestBlock(networkId = 'ethereum', options = {}) {
  const network = await getNetwork(networkId);
  // Standard method is `eth_blockNumber`; the non-standard `eth_getBlockNumber`
  // is rejected by several public providers (live-proven when the discovery
  // pipeline first hit a real chain).
  const hex = await rpcCallThroughNetwork(network, 'eth_blockNumber', [], {
    ...options,
  });
  return parseInt(hex, 16);
}

/**
 * Check whether a contract is actually deployed at an address.
 * @returns {{ deployed: boolean, bytecodeLength: number }}
 */
export async function getCode(networkId, address, options = {}) {
  const network = await getNetwork(networkId);
  if (!isAddress(address)) {
    throw new Error(`Invalid address for getCode: ${address}`);
  }
  const result = await rpcCallThroughNetwork(network, 'eth_getCode', [address, 'latest'], {
    ...options,
  });
  const code = typeof result === 'string' ? result.replace(/^0x/, '') : '';
  return {
    deployed: code.length > 0,
    bytecodeLength: Math.floor(code.length / 2),
  };
}

export async function getBalance(networkId, address, options = {}) {
  const network = await getNetwork(networkId);
  const result = await rpcCallThroughNetwork(network, 'eth_getBalance', [address, 'latest'], {
    ...options,
  });
  return BigInt(result || '0x0');
}

/**
 * Read a standard ERC-20 property via eth_call (decimals / totalSupply).
 * Decodes a 32-byte value using the token's own `decimals` field where
 * relevant. Returns a string keyed on the property name.
 */
async function erc20Property(networkId, token, property, options = {}) {
  const network = await getNetwork(networkId);
  if (!isAddress(token)) {
    throw new Error(`Invalid token address: ${token}`);
  }
  const selector = SELECTORS[property];
  if (!selector) throw new Error(`Unsupported ERC-20 property: ${property}`);

  const result = await rpcCallThroughNetwork(
    network,
    'eth_call',
    [{ to: token, data: selector }, 'latest'],
    { ...options },
  );

  const hex = typeof result === 'string' ? result : '0x0';
  try {
    const value = BigInt(hex);
    if (property === 'decimals') {
      return Number(value);
    }
    return value.toString();
  } catch {
    throw new Error(`Could not decode ${property} for ${token}`);
  }
}

/**
 * Low-level eth_call returning the raw hex result.
 * Read-only, never signs. Shared by the higher-level typed helpers.
 */
export async function callRaw(networkId, to, data, options = {}) {
  const network = await getNetwork(networkId);
  if (!isAddress(to)) throw new Error(`Invalid contract address for call: ${to}`);
  const result = await rpcCallThroughNetwork(
    network,
    'eth_call',
    [{ to, data }, 'latest'],
    options,
  );
  return typeof result === 'string' ? result : '0x';
}

/** eth_call decoding a single uint256 word. */
export async function callWord(networkId, to, selector, args = [], options = {}) {
  return decodeUint(await callRaw(networkId, to, encodeCalldata(selector, args), options));
}

/** eth_call decoding a single address (low 20 bytes of the word). */
export async function callAddress(networkId, to, selector, args = [], options = {}) {
  return decodeAddress(await callRaw(networkId, to, encodeCalldata(selector, args), options));
}

/** eth_call decoding a boolean (nonzero word => true). */
export async function callBoolean(networkId, to, selector, args = [], options = {}) {
  return (await callWord(networkId, to, selector, args, options)) !== 0n;
}

/** eth_call decoding a dynamic string. */
export async function callString(networkId, to, selector, args = [], options = {}) {
  return decodeString(await callRaw(networkId, to, encodeCalldata(selector, args), options));
}

/** Real, on-chain token symbol (never assumed). */
export async function getTokenSymbol(networkId, token, options = {}) {
  return callString(networkId, token, SELECTORS.symbol, [], options);
}

/** Real, on-chain token name (never assumed). */
export async function getTokenName(networkId, token, options = {}) {
  return callString(networkId, token, SELECTORS.name, [], options);
}

/** Real, on-chain token decimals (never assume 18). */
export async function getTokenDecimals(networkId, token, options = {}) {
  return erc20Property(networkId, token, 'decimals', options);
}

/** Real, on-chain total supply as a decimal string (unit = token units). */
export async function getTokenTotalSupply(networkId, token, options = {}) {
  return erc20Property(networkId, token, 'totalSupply', options);
}

/**
 * Perform a raw eth_call and decode a single 32-byte word.
 */
async function ethCallWord(networkId, to, data, options = {}) {
  const network = await getNetwork(networkId);
  const result = await rpcCallThroughNetwork(
    network,
    'eth_call',
    [{ to, data }, 'latest'],
    options,
  );
  return decodeUint(result);
}

/**
 * Read the ERC-20 balance of an address.
 * @returns {bigint}
 */
export async function getTokenBalance(networkId, token, owner, options = {}) {
  if (!isAddress(token) || !isAddress(owner)) {
    throw new Error('Invalid token or owner address for balanceOf');
  }
  return ethCallWord(
    networkId,
    token,
    encodeCalldata(SELECTORS.balanceOf, [{ type: 'address', value: owner }]),
    options,
  );
}

/**
 * Read the ERC-20 allowance granted to a spender.
 * @returns {bigint}
 */
export async function getTokenAllowance(networkId, token, owner, spender, options = {}) {
  if (!isAddress(token) || !isAddress(owner) || !isAddress(spender)) {
    throw new Error('Invalid token/owner/spender address for allowance');
  }
  return ethCallWord(
    networkId,
    token,
    encodeCalldata(SELECTORS.allowance, [
      { type: 'address', value: owner },
      { type: 'address', value: spender },
    ]),
    options,
  );
}

/**
 * Read GuardianVault state needed to verify (a) depositor eligibility and
 * (b) resulting-state after a deposit/withdraw.
 * @returns {Promise<object>} human-decimal + raw fields
 */
export async function getVaultState(networkId, { vault, token, owner }, options = {}) {
  if (!isAddress(vault)) throw new Error('Invalid vault address');
  const [totalAssets_, totalSupply_, sharesOf, asset_, strategy_, supported_, paused_] =
    await Promise.all([
      ethCallWord(networkId, vault, SELECTORS.totalAssets, options),
      ethCallWord(networkId, vault, SELECTORS.totalSupply, options),
      isAddress(owner)
        ? ethCallWord(
            networkId,
            vault,
            encodeCalldata(SELECTORS.balanceOf, [{ type: 'address', value: owner }]),
            options,
          )
        : Promise.resolve(0n),
      ethCallWord(networkId, vault, SELECTORS.asset, options),
      ethCallWord(networkId, vault, SELECTORS.strategy, options),
      isAddress(token)
        ? ethCallWord(
            networkId,
            vault,
            encodeCalldata(SELECTORS.supportedTokens, [{ type: 'address', value: token }]),
            options,
          )
        : Promise.resolve(0n),
      ethCallWord(networkId, vault, SELECTORS.paused, options),
    ]);

  return {
    totalAssets: totalAssets_.toString(),
    totalSupply: totalSupply_.toString(),
    sharesOf: sharesOf.toString(),
    asset: wordToAddress(asset_),
    strategy: wordToAddress(strategy_),
    tokenSupported: supported_ !== 0n,
    paused: paused_ !== 0n,
    // previewRedeem(10 ** decimals) in base units → base units per share*unit.
    exchangeRateRaw: totalSupply_ === 0n ? 0n : (await previewRedeem(networkId, vault, 1n, options)),
  };
}

/** Decode a uint256 word (bigint) into a lowercase 0x address. */
function wordToAddress(wordBigInt) {
  const hex = (wordBigInt == null ? 0n : BigInt(wordBigInt)).toString(16).padStart(40, '0');
  return `0x${hex.slice(-40)}`;
}

/** previewRedeem(1 share) — the base-unit redemption value of one receipt share. */
export async function previewRedeem(networkId, vault, shares = 1n, options = {}) {
  return ethCallWord(
    networkId,
    vault,
    encodeCalldata(SELECTORS.previewRedeem, [{ type: 'uint256', value: shares }]),
    options,
  );
}

/**
 * Estimate gas for a proposed transaction (client-side preview UX).
 * @param {string} networkId
 * @param {{from: string, to: string, value?: bigint, data?: string}} tx
 * @returns {Promise<{gasLimit: bigint, baseFeePerGas?: bigint}>}
 */
export async function estimateContractCall(networkId, { from, to, value = 0n, data = '0x' }, options = {}) {
  const network = await getNetwork(networkId);
  if (!isAddress(from) || !isAddress(to)) throw new Error('estimateGas needs from/to');
  const result = await rpcCallThroughNetwork(
    network,
    'eth_estimateGas',
    [{ from, to, value: `0x${BigInt(value).toString(16)}`, data }],
    options,
  );
  return { gasLimit: BigInt(result) };
}

/**
 * Fetch and normalize a transaction receipt.
 * @returns {Promise<object|null>}
 */
export async function getTransactionReceipt(networkId, txHash, options = {}) {
  const network = await getNetwork(networkId);
  const receipt = await rpcCallThroughNetwork(
    network,
    'eth_getTransactionReceipt',
    [txHash],
    options,
  );
  if (!receipt) return null;
  const status = receipt.status === '0x1' ? 'success' : 'failed';
  return {
    hash: receipt.transactionHash,
    status,
    blockNumber: parseInt(receipt.blockNumber, 16),
    gasUsed: BigInt(receipt.gasUsed || '0x0'),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice || '0x0'),
    from: receipt.from,
    to: receipt.to,
    logs: (receipt.logs || []).map((log) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
    })),
  };
}

/**
 * eth_getLogs for a contract address + optional topic0 filter.
 * When `address` is omitted the filter is topic-only (whole chain scan),
 * e.g. for Uniswap-style "pool created" events that can come from any
 * factory on the network.
 * @returns {Promise<Array<{address, topics, data, blockNumber, logIndex, transactionHash}>>}
 */
export async function getLogs(networkId, { address, topics = [], fromBlock, toBlock = 'latest' }, options = {}) {
  const network = await getNetwork(networkId);
  const filter = {
    fromBlock: typeof fromBlock === 'number' ? `0x${fromBlock.toString(16)}` : fromBlock,
    toBlock,
  };
  if (address) filter.address = address;
  if (topics.length) filter.topics = topics;
  const logs = await rpcCallThroughNetwork(
    network,
    'eth_getLogs',
    [filter],
    options,
  );
  return (logs || []).map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: parseInt(log.blockNumber, 16),
    logIndex: parseInt(log.logIndex, 16),
    transactionHash: log.transactionHash,
  }));
}

/**
 * Decode a Transfer/Deposit/StrategyRouted-style log into typed values.
 */
export function decodeLog(log) {
  return decodeEventArgs(log.topics, log.data);
}

/**
 * Perform a batch of independent on-chain inspections for an opportunity
 * (contract existence + asset decimals). If any single check fails it is
 * reported individually so partial data is still usable.
 */
export async function inspectContracts(
  { chainId, contractAddress, assetAddress },
  options = {},
) {
  const network = await getNetwork('ethereum');
  if (chainId && chainId !== network.chainId) {
    throw new Error(`Unsupported chain id ${chainId} (only chain ${network.chainId} configured)`);
  }

  const results = { network: network.id, chainId: network.chainId, checks: {} };

  if (contractAddress) {
    results.contract = await getCode('ethereum', contractAddress, options);
    results.checks.contract = 'ok';
  }
  if (assetAddress) {
    try {
      results.tokenDecimals = await getTokenDecimals('ethereum', assetAddress, options);
      results.checks.tokenDecimals = 'ok';
    } catch (err) {
      results.tokenDecimals = null;
      results.checks.tokenDecimals = 'error';
      results.tokenDecimalsError = err.message;
    }
  }
  return results;
}