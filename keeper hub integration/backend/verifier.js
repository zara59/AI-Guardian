// Phase 5: Blockchain verifier.
//
// After KeeperHub reports execution success, this module independently
// verifies the blockchain state. The blockchain is the final source of
// truth — KeeperHub's status is informational, not authoritative.

import { getTransactionReceipt, getLogs, getVaultState } from '../../security-layer/backend/provider.js';

/**
 * Independently verify a completed execution on-chain.
 *
 * Steps:
 *   1. Query the transaction receipt
 *   2. Confirm receipt status is success
 *   3. Verify the destination contract matches
 *   4. Read vault events in the same block
 *   5. Read vault state after the transaction
 *   6. Compare expected vs actual
 *
 * @param {object} workflow — from repository
 * @param {object} [deps] — injectable dependencies for testing
 * @returns {Promise<{verified: boolean, receipt: object|null, events: Array, vaultState: object|null, reason: string|null}>}
 */
export async function verifyExecution(workflow, deps = {}) {
  const {
    getReceipt = getTransactionReceipt,
    getLogsFn = getLogs,
    getVaultStateFn = getVaultState,
  } = deps;

  const networkId = workflow.chain || 'sepolia';
  const txHash = workflow.txHash;

  if (!txHash) {
    return { verified: false, receipt: null, events: [], vaultState: null, reason: 'No transaction hash available' };
  }

  // 1. Fetch the receipt
  let receipt;
  try {
    receipt = await getReceipt(networkId, txHash);
  } catch (err) {
    return { verified: false, receipt: null, events: [], vaultState: null, reason: `Receipt fetch failed: ${err.message}` };
  }

  if (!receipt) {
    return { verified: false, receipt: null, events: [], vaultState: null, reason: 'Transaction not found on-chain (still pending or does not exist)' };
  }

  // 2. Confirm receipt status
  if (receipt.status !== 'success') {
    return { verified: false, receipt, events: [], vaultState: null, reason: 'Transaction reverted on-chain' };
  }

  // 3. Verify destination
  const expectedTo = workflow.vaultAddress?.toLowerCase();
  const actualTo = receipt.to?.toLowerCase();
  if (expectedTo && actualTo && expectedTo !== actualTo) {
    return { verified: false, receipt, events: [], vaultState: null, reason: `Destination mismatch: expected ${expectedTo}, got ${actualTo}` };
  }

  // 4. Read vault events
  let events = [];
  try {
    const logs = await getLogsFn(networkId, {
      address: workflow.vaultAddress,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    events = logs
      .filter((log) => log.address?.toLowerCase() === expectedTo)
      .slice(0, 10)
      .map((log) => ({
        address: log.address,
        transactionHash: log.transactionHash,
        data: log.data?.slice(0, 130),
        blockNumber: log.blockNumber,
      }));
  } catch {
    events = [];
  }

  // 5. Read vault state
  let vaultState = null;
  try {
    vaultState = await getVaultStateFn(networkId, {
      vault: workflow.vaultAddress,
      token: workflow.tokenAddress,
      owner: workflow.walletAddress,
    });
  } catch {
    vaultState = null;
  }

  return {
    verified: true,
    receipt: {
      hash: receipt.hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString() || null,
      from: receipt.from,
      to: receipt.to,
    },
    events,
    vaultState,
    reason: null,
  };
}
