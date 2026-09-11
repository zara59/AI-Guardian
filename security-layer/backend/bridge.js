// Phase 4 transaction bridge.
//
// The backend PREPARES transactions (server-derived targets, server-computed
// amounts, risk gate); the user SIGNS them with their own wallet. This service
// never holds a key and never authorizes a transfer beyond the user's own
// signed + prepared payload.
//
// Every function accepts an optional `deps` object so tests can stub the
// blockchain/registry layer without a live RPC or Postgres.

import crypto from 'node:crypto';
import * as transactionRepository from './repository.js';
import * as opportunityRepository from '../../backend/src/repositories/opportunityRepository.js';
import * as activityRepository from '../../backend/src/repositories/activityRepository.js';
import { getUserRepositoryContext } from '../../backend/src/services/userHelper.js';
import { getGuardianContracts } from './registry.js';
import { getNetwork, isAddress } from '../../backend/src/config/networks.js';
import {
  getTokenBalance,
  getTokenAllowance,
  estimateContractCall,
  getTransactionReceipt,
  getLogs,
  getVaultState,
} from './provider.js';
import { encodeCalldata } from './abi.js';
import { toRaw, fromRaw } from './amounts.js';
import { ApiError } from '../../backend/src/utils/response.js';

// A preparation is only valid for a short window — the on-chain world moves.
const VALID_FOR_MINUTES = 60 * 24; // 24h for a demo; tighten in production.

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

const DEFAULT_TOKEN_SYMBOL = 'gTEST';

function estimateDataFor(type, { token, spender, vault, assets, receiver, owner }) {
  if (type === 'approve') {
    // ERC-20 approve(spender, amount)
    return encodeCalldata('0x095ea7b3', [
      { type: 'address', value: spender },
      { type: 'uint256', value: assets },
    ]);
  }
  if (type === 'deposit') {
    // ERC-4626 deposit(assets, receiver)
    return encodeCalldata('0x6e553f65', [
      { type: 'uint256', value: assets },
      { type: 'address', value: receiver },
    ]);
  }
  if (type === 'withdraw') {
    // ERC-4626 withdraw(assets, receiver, owner)
    return encodeCalldata('0xb460af94', [
      { type: 'uint256', value: assets },
      { type: 'address', value: receiver },
      { type: 'address', value: owner },
    ]);
  }
  throw new ApiError(400, `unsupported transaction type: ${type}`, 'INVALID_TYPE');
}

/** Resolve which on-chain execution path an opportunity maps to. */
function executionTarget(opportunity) {
  return {
    opportunityId: opportunity.id,
    chainId: Number(opportunity.chainId),
    chain: String(opportunity.chain || '').toLowerCase(),
  };
}

/**
 * Risk gate: with the prepared payload in hand, confirm the opportunity
 * actually clears the same bar the ranking engine uses before a transaction
 * is allowed to exist. Rejections are hard 409s with an explanation.
 */
function riskGate({ opportunity }) {
  const reasons = [];
  if (opportunity.eligibility === 'insufficient-data') {
    reasons.push('Guardian does not have enough verified data about this opportunity');
  }
  if (opportunity.eligibility === 'avoid') {
    reasons.push('This opportunity is flagged with a hard blocker');
  }
  if (opportunity.risk === 'high') {
    reasons.push('High-risk opportunities require manual review');
  }
  if (reasons.length) {
    throw new ApiError(409, reasons.join('; '), 'RISK_GATE');
  }
}

function opportunityScoreOf(opp) {
  const parts = [
    opp.smartContractSecurity, opp.protocolHistory, opp.liquidityStability,
    opp.contractPermissions, opp.exploitIndicators, opp.currentYield,
    opp.historicalSustainability, opp.incentives, opp.opportunitySize,
    opp.marketConditions, opp.businessModel, opp.rewardSustainability,
    opp.protocolActivity, opp.availableLiquidity, opp.withdrawalConditions,
    opp.minimumCapital, opp.riskPreferenceFit, opp.complexity, opp.timeCommitment,
  ];
  return Math.round(parts.reduce((a, b) => a + Number(b || 0), 0));
}

function buildDeps(overrides = {}) {
  return {
    transactionRepository,
    opportunityRepository,
    activityRepository,
    getUserRepositoryContext,
    getGuardianContracts,
    getNetwork,
    provider: {
      getTokenBalance,
      getTokenAllowance,
      estimateContractCall,
      getTransactionReceipt,
      getLogs,
      getVaultState,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prepare a transaction for a ranked, eligible opportunity.
 * Server-derived: chain, vault, strategy, token and base-unit amount all come
 * from the registry/on-chain reads — never from client input.
 */
export async function prepareTransaction(payload, overrides = {}) {
  const deps = buildDeps(overrides);
  const { opportunityId, walletAddress, type = 'deposit', amount } = payload;
  if (!/^(deposit|withdraw|approve)$/.test(type)) {
    throw new ApiError(400, 'type must be one of deposit, withdraw, approve', 'INVALID_TYPE');
  }
  if (!isAddress(walletAddress)) {
    throw new ApiError(400, 'walletAddress must be a valid address', 'INVALID_WALLET');
  }
  if (typeof amount !== 'string' && typeof amount !== 'number') {
    throw new ApiError(400, 'amount is required', 'INVALID_AMOUNT');
  }

  const user = await deps.getUserRepositoryContext();
  const opportunity = await deps.opportunityRepository.findById(opportunityId);
  if (!opportunity) {
    throw new ApiError(404, `opportunity ${opportunityId} not found`, 'NOT_FOUND');
  }

  riskGate({ opportunity });

  // --- deployment + network must exist ------------------------------------
  const target = executionTarget(opportunity);
  const contracts = await deps.getGuardianContracts(target.chainId);
  if (!contracts) {
    throw new ApiError(
      503,
      `No Guardian contract deployment on chain ${target.chainId} (${target.chain}). Preparation refused.`,
      'NOT_DEPLOYED',
    );
  }
  const network = await deps.getNetwork(target.chain);
  if (!network) {
    throw new ApiError(503, `network ${target.chain} is not configured`, 'UNKNOWN_NETWORK');
  }

  const { token, strategy, vault } = contracts;

  // --- real on-chain decimals (never assume 18) ---------------------------
  const decimals = token.decimals;
  let rawAmount;
  try {
    rawAmount = toRaw(String(amount), decimals); // throws on bad input
  } catch {
    throw new ApiError(400, `amount must be a positive number with at most ${decimals} decimals`, 'INVALID_AMOUNT');
  }
  if (rawAmount <= 0n) {
    throw new ApiError(400, 'amount must be positive', 'INVALID_AMOUNT');
  }

  const spendTo = type === 'approve' ? token.address : vault.address;
  const txData = estimateDataFor(type, {
    token: token.address,
    spender: vault.address,
    vault: vault.address,
    assets: rawAmount,
    receiver: walletAddress,
    owner: walletAddress,
  });

  // --- live balances / allowances / gas for the user's wallet -------------
  const [balance, allowance, gas] = await Promise.all([
    deps.provider.getTokenBalance(network.id, token.address, walletAddress),
    deps.provider.getTokenAllowance(network.id, token.address, walletAddress, vault.address),
    deps.provider
      .estimateContractCall(network.id, {
        from: walletAddress,
        to: spendTo,
        value: 0n,
        data: txData,
      })
      .catch(() => ({ gasLimit: 0n, estimable: false })),
  ]);

  const warnings = [];
  if (type === 'deposit' && balance < rawAmount) {
    warnings.push(
      `Token balance ${fromRaw(balance, decimals)} is below the request ${String(amount)}`,
    );
  }
  if (type === 'deposit' && allowance < rawAmount) {
    warnings.push('Wallet allowance covers only part of this deposit — an approval step is needed.');
  }
  if (type === 'withdraw' && balance < rawAmount) {
    warnings.push('Wallet balance check is informational; withdraw targets vault shares.');
  }
  if (!gas.estimable) {
    warnings.push('Gas could not be pre-estimated (wallet will estimate at signature time).');
  }

  const prepareId = hashId(['guardian', type, opportunityId, walletAddress, rawAmount.toString(), Date.now()]);
  const validUntil = new Date(Date.now() + VALID_FOR_MINUTES * 60 * 1000);

  const record = await deps.transactionRepository.insert({
    userId: user.id,
    prepareId,
    opportunityId: opportunity.id,
    type,
    chain: network.id,
    chainId: network.chainId,
    tokenAddress: token.address,
    tokenDecimals: decimals,
    vaultAddress: vault.address,
    strategyAddress: strategy?.address ?? null,
    amountRaw: rawAmount.toString(),
    amountHuman: String(amount),
    spendTo,
    status: 'prepared',
    validUntil,
    metadata: {
      riskGate: 'passed',
      score: opportunityScoreOf(opportunity),
      eligibility: opportunity.eligibility,
      warnings,
      estimatedGas: gas.gasLimit > 0n ? gas.gasLimit.toString() : null,
      calldata: txData,
      opportunityName: opportunity.name,
    },
  });

  await deps.activityRepository.insert({
    userId: user.id,
    type: 'transaction',
    title: `Transaction prepared · ${type}`,
    description: `${type} of ${String(amount)} ${token.address.slice(0, 6)}… via GuardianVault`,
    metadata: { prepareId, type, chain: network.id, spendTo },
  });

  return {
    prepareId: record.prepareId,
    type: record.type,
    chain: record.chain,
    chainId: record.chainId,
    status: record.status,
    validUntil: record.validUntil,
    asset: {
      address: token.address,
      symbol: DEFAULT_TOKEN_SYMBOL,
      decimals: token.decimals,
    },
    vault: { address: vault.address },
    strategy: strategy ? { address: strategy.address } : null,
    amount: { raw: record.amountRaw, human: record.amountHuman },
    tx: {
      to: spendTo,
      data: txData,
      value: '0x0',
      estimatedGas: record.metadata.estimatedGas,
      from: walletAddress.toLowerCase(),
    },
    warnings,
    opportunity: { id: opportunity.id, name: opportunity.name, score: opportunityScoreOf(opportunity) },
  };
}

/** Purge expired 'prepared' records so status lookups stay truthful. */
async function sweepExpired(deps) {
  if (typeof deps?.transactionRepository?.expireStale !== 'function') return 0;
  try {
    return await deps.transactionRepository.expireStale();
  } catch {
    return 0; // best-effort sweep; never blocks the request
  }
}

/** A prepared transaction is only usable until its window closes. */
function assertUsable(record) {
  if (record.status === 'expired') {
    throw new ApiError(
      409,
      'This preparation has expired; review a fresh execution plan before signing.',
      'PREPARATION_EXPIRED',
    );
  }
  if (
    record.status === 'prepared' &&
    record.validUntil &&
    new Date() > new Date(record.validUntil)
  ) {
    throw new ApiError(
      409,
      'This preparation has expired; review a fresh execution plan before signing.',
      'PREPARATION_EXPIRED',
    );
  }
}

/** Fetch the live status of a prepared transaction. */
export async function getTransactionStatus(prepareId, overrides = {}) {
  const deps = buildDeps(overrides);
  await sweepExpired(deps);
  const record = await deps.transactionRepository.findByPrepareId(prepareId);
  if (!record) {
    throw new ApiError(404, `prepareId ${prepareId} not found`, 'NOT_FOUND');
  }
  return serializeRecord(record);
}

/** Record the user-signed tx hash. */
export async function recordUserTransaction(prepareId, { txHash, status = 'signed' }, overrides = {}) {
  const deps = buildDeps(overrides);
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash || '')) {
    throw new ApiError(400, 'txHash must be a 0x transaction hash (64 hex)', 'INVALID_TX_HASH');
  }
  await sweepExpired(deps);
  const record = await deps.transactionRepository.findByPrepareId(prepareId);
  if (!record) {
    throw new ApiError(404, `prepareId ${prepareId} not found`, 'NOT_FOUND');
  }
  assertUsable(record);
  if (record.status === 'confirmed' || record.status === 'failed') {
    return serializeRecord(record); // already finalized
  }

  const patch = { txHash: txHash.toLowerCase(), signedAt: new Date(), status };
  if (status === 'rejected') {
    patch.status = 'rejected';
  }
  const updated = await deps.transactionRepository.updateByPrepareId(prepareId, patch);
  await deps.activityRepository.insert({
    userId: record.userId,
    type: 'transaction',
    title: `Transaction signed · ${record.type}`,
    description: `Signed ${record.type} of ${record.amountHuman} (${record.txHash})`,
    metadata: { prepareId, txHash },
  });
  return serializeRecord(updated);
}

/**
 * Verify a submitted/signed transaction on-chain and persist the final state.
 * Confirmation = receipt + a vault log in the same block + a resulting-state
 * readback (exchange rate / balances) the frontend can display.
 */
export async function verifyTransactionState(prepareId, overrides = {}) {
  const deps = buildDeps(overrides);
  await sweepExpired(deps);
  const record = await deps.transactionRepository.findByPrepareId(prepareId);
  if (!record) throw new ApiError(404, `prepareId ${prepareId} not found`, 'NOT_FOUND');
  assertUsable(record);
  if (!record.txHash) {
    throw new ApiError(409, 'transaction not signed yet', 'NOT_SIGNED');
  }

  const receipt = await deps.provider.getTransactionReceipt(record.chain, record.txHash);
  if (!receipt) {
    // Still pending in the mempool.
    return { ...serializeRecord(record), verification: { mined: false } };
  }

  const patch = {
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  };
  if (receipt.status === 'success') patch.confirmedAt = new Date();
  else patch.errorMessage = 'Transaction reverted on-chain';
  await deps.transactionRepository.updateByPrepareId(prepareId, patch);

  let onChain = null;
  if (receipt.status === 'success') {
    onChain = await readBackResult(deps, record, receipt);
  }

  await deps.activityRepository.insert({
    userId: record.userId,
    type: 'transaction',
    title: `Transaction confirmed · ${record.type}`,
    description:
      receipt.status === 'success'
        ? `${record.type} confirmed in block ${receipt.blockNumber}`
        : `${record.type} reverted on-chain`,
    metadata: { prepareId, txHash: record.txHash, status: receipt.status, blockNumber: receipt.blockNumber },
  });

  return {
    ...serializeRecord({ ...record, ...patch }),
    verification: { mined: true, receipt, onChain },
  };
}

async function readBackResult(deps, record, receipt) {
  const logs = await deps.provider
    .getLogs(record.chain, {
      address: record.vaultAddress,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    })
    .catch(() => []);

  const relevant = logs.filter(
    (log) =>
      typeof log?.data === 'string' &&
      log.data.length > 130 &&
      log.address.toLowerCase() === record.vaultAddress.toLowerCase(),
  );

  const state = await deps.provider
    .getVaultState(record.chain, {
      vault: record.vaultAddress,
      token: record.tokenAddress,
      owner: receipt.from,
    })
    .catch(() => null);

  return {
    events: relevant.slice(0, 10).map((log) => ({
      address: log.address,
      transactionHash: log.transactionHash,
      data: log.data.slice(0, 130),
    })),
    vaultState: state,
    receiptHash: receipt.hash,
  };
}

export async function listTransactionsForUser(limit = 20, overrides = {}) {
  const deps = buildDeps(overrides);
  await sweepExpired(deps);
  const user = await deps.getUserRepositoryContext();
  return (await deps.transactionRepository.findRecentByUser(user.id, limit)).map(serializeRecord);
}

function serializeRecord(record) {
  return {
    id: record.id,
    prepareId: record.prepareId,
    type: record.type,
    chain: record.chain,
    chainId: record.chainId,
    status: record.status,
    amount: { raw: record.amountRaw, human: record.amountHuman },
    asset: {
      address: record.tokenAddress,
      decimals: record.tokenDecimals,
      symbol: DEFAULT_TOKEN_SYMBOL,
    },
    vault: { address: record.vaultAddress },
    strategy: record.strategyAddress ? { address: record.strategyAddress } : null,
    spendTo: record.spendTo,
    txHash: record.txHash || null,
    blockNumber: record.blockNumber ?? null,
    gasUsed: record.gasUsed ?? null,
    errorMessage: record.errorMessage ?? null,
    signedAt: record.signedAt ?? null,
    confirmedAt: record.confirmedAt ?? null,
    validUntil: record.validUntil ?? null,
    createdAt: record.createdAt,
    metadata: record.metadata || {},
  };
}