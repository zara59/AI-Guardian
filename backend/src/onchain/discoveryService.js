// On-chain opportunity discovery — the "filter for web3".
//
// Reads the deployed GuardianRegistry on each configured chain and turns
// validated registrations into rankable opportunities. Everything is on-chain:
//   - new registrations arrive as StrategyRegistered event logs
//     (eth_getLogs, incremental via a persisted block cursor)
//   - the first run backfills the current full list via registrations(i) reads
//   - every entry is re-validated against the chain (validator.js)
//   - yield is sampled from the vault's own share price over time
//     (opportunity_share_samples) — no external aggregator, ever
//
// The pipeline is strictly additive and fail-soft: a chain with no deployed
// registry is reported as disabled, not an error.

import { getNetwork } from '../config/networks.js';
import * as blockchainProvider from '../external/blockchainProvider.js';
import { getGuardianRegistry } from '../config/contracts.js';
import * as oppRepository from '../repositories/opportunityRepository.js';
import * as discRepository from './discoveryRepository.js';
import { validateRegistration } from './validator.js';
import { estimateApyFromSamples, pickTwoMostRecent } from './shareApy.js';
import { buildDiscoveredOpportunity } from './buildOpportunity.js';
import {
  STRATEGY_REGISTERED_SIGNATURE,
  strategyRegisteredTopic,
  REGISTRY_SELECTORS,
  decodeStrategyRegistered,
  decodeRegistrationCallResult,
} from './registryAbi.js';
import { encodeUint } from '../../../security-layer/backend/abi.js';
import { logger } from '../utils/logger.js';

const BOOTSTRAP_CAP = 500;
const EVENTS_LOOKBACK_BLOCKS = 10_000;
const LOGS_CHUNK_BLOCKS = 5_000;
const RPC_OPTIONS = { retries: 1, timeoutMs: 8_000 };

/** Chunked eth_getLogs so range-limited public RPCs still work. */
async function logsInRange(provider, networkId, { address, topic, fromBlock, toBlock }) {
  const logs = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = Math.min(cursor + LOGS_CHUNK_BLOCKS - 1, toBlock);
    try {
      const chunk = await provider.getLogs(
        networkId,
        { address, topics: [topic], fromBlock: cursor, toBlock: end },
        RPC_OPTIONS,
      );
      logs.push(...chunk);
    } catch (err) {
      logger.warn('registry log chunk failed, keeping partial results', {
        networkId,
        from: cursor,
        to: end,
        message: err.message,
      });
      break;
    }
    if (end >= toBlock) break;
    cursor = end + 1;
  }
  return logs;
}

async function readRegistrations(networkId, registryAddress, provider) {
  const rows = [];
  const count = Number(
    await provider.callWord(networkId, registryAddress, REGISTRY_SELECTORS.registrationsCount),
  );
  const toRead = Math.min(count || 0, BOOTSTRAP_CAP);
  for (let i = 0; i < toRead; i += 1) {
    const raw = await provider.callRaw(
      networkId,
      registryAddress,
      `${REGISTRY_SELECTORS.registrations}${encodeUint(i)}`,
    );
    const decoded = decodeRegistrationCallResult(raw);
    if (decoded) rows.push(decoded);
  }
  if (count > BOOTSTRAP_CAP) {
    logger.warn('GuardianRegistry bootstrap truncated', {
      networkId,
      count,
      cap: BOOTSTRAP_CAP,
    });
  }
  return rows;
}

async function sampleAndRecord(registration, ctx) {
  const {
    networkId,
    chainId,
    provider,
    eligible,
    reason,
    codeLengths,
    checks,
    latest,
  } = ctx;

  let apy = null;
  if (eligible) {
    const totalAssets = (
      await provider.callWord(networkId, registration.vault, provider.SELECTORS.totalAssets)
    ).toString();
    const totalSupply = (
      await provider.callWord(networkId, registration.vault, provider.SELECTORS.totalSupply)
    ).toString();
    await discRepository.insertShareSample({
      chainId,
      vault: registration.vault.toLowerCase(),
      token: registration.token.toLowerCase(),
      blockNo: latest,
      totalAssets,
      totalSupply,
    });
    const pair = pickTwoMostRecent(
      await discRepository.latestShareSamples(chainId, registration.vault.toLowerCase(), 2),
    );
    apy = pair ? estimateApyFromSamples(pair.older, pair.newer) : null;
  }

  const record = buildDiscoveredOpportunity({
    registration,
    validation: { checks, codeLengths },
    apy,
    networkId,
    chainId,
    lastUpdated: new Date().toISOString(),
    tokenSymbol: checks.tokenSymbol || 'ERC-20',
    tokenDecimals: Number.isInteger(checks.tokenDecimals) ? checks.tokenDecimals : 18,
  });

  // Honest eligibility: a validated entry is rankable; a failed re-validation
  // is persisted as blocked/unrankable with the reasons exposed.
  if (!eligible) {
    record.eligibility = 'avoid';
    record.eligibilityReason = reason || 'Failed on-chain re-validation.';
    record.hardFlags = [...(record.hardFlags || []), 'registration-invalidated'];
  }

  await oppRepository.insert(record);
  return { apy, eligible };
}

/**
 * Run discovery on one chain.
 * @returns {Promise<object>} honest per-chain report (never throws)
 */
export async function discoverOnChain({ networkId = 'ethereum', deps = {} } = {}) {
  const provider = deps.provider || blockchainProvider;
  const started = Date.now();
  const report = {
    source: 'onchain',
    chain: networkId,
    enabled: false,
    scanned: [],
    bootstrapped: false,
    rejected: [],
    added: 0,
    apySampled: 0,
    error: null,
  };

  try {
    const network = await getNetwork(networkId);
    const chainId = network.chainId;
    report.chainId = chainId;

    const registryInfo =
      deps.registryInfo !== undefined
        ? deps.registryInfo
        : await getGuardianRegistry(chainId);
    if (!registryInfo?.address) {
      report.reason = `GuardianRegistry not deployed on ${networkId} (add the deployment to security-layer/config/contracts/${chainId}.json).`;
      return report;
    }
    report.registry = registryInfo.address.toLowerCase();
    report.enabled = true;

    const [state, latest] = await Promise.all([
      discRepository.getDiscoveryState(chainId),
      provider.getLatestBlock(networkId),
    ]);
    report.scannedTo = latest;

    // Backfill the current full list on the very first run so registrations
    // that predate the event lookback window are not missed.
    const registrations = [];
    if (!state) {
      for (const reg of await readRegistrations(networkId, registryInfo.address, provider)) {
        registrations.push(reg);
      }
      report.bootstrapped = registrations.length > 0;
    }

    // Incremental event scan (StrategyRegistered logs) since the last cursor.
    const fromBlock =
      state?.lastBlock !== undefined && state?.lastBlock !== null
        ? Number(state.lastBlock)
        : latest - EVENTS_LOOKBACK_BLOCKS;
    const toBlock = latest;
    report.scanned = [fromBlock, toBlock];

    const logs = (state?.lastBlock !== undefined && state?.lastBlock !== null)
      ? await logsInRange(provider, networkId, {
          address: registryInfo.address.toLowerCase(),
          topic: strategyRegisteredTopic(),
          fromBlock,
          toBlock,
        })
      : [];
    for (const log of logs) {
      const decoded = decodeStrategyRegistered(log.topics, log.data);
      if (decoded) registrations.push(decoded);
    }

    // De-duplicate by strategy address (bootstrap + events can overlap).
    const seen = new Map();
    for (const reg of registrations) {
      const key = reg.strategy.toLowerCase();
      if (!seen.has(key)) seen.set(key, reg);
    }

    for (const registration of seen.values()) {
      try {
        const { ok, reasons, checks, codeLengths } = await validateRegistration(registration, {
          networkId,
          provider,
        });
        const ctx = {
          networkId,
          chainId,
          provider,
          codeLengths,
          checks,
          latest,
        };
        if (!ok) {
          report.rejected.push({
            strategy: registration.strategy,
            name: registration.name || '',
            reasons,
          });
          await sampleAndRecord(registration, {
            ...ctx,
            eligible: false,
            reason: `On-chain re-validation failed: ${reasons.join(' ')}`,
          });
          continue;
        }
        const { apy, eligible } = await sampleAndRecord(registration, { ...ctx, eligible: true });
        if (eligible && apy !== null) report.apySampled += 1;
        report.added += 1;
      } catch (err) {
        report.rejected.push({
          strategy: registration.strategy,
          name: registration.name || '',
          reasons: [err.message],
        });
      }
    }

    await discRepository.upsertDiscoveryState(chainId, registryInfo.address.toLowerCase(), latest);
    report.durationMs = Date.now() - started;
    return report;
  } catch (err) {
    report.error = err.message;
    report.durationMs = Date.now() - started;
    return report;
  }
}

export { STRATEGY_REGISTERED_SIGNATURE };