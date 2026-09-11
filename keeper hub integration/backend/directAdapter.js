// Phase 5: Direct execution adapter (Phase 4 baseline).
//
// Wraps the existing Phase 4 transaction bridge as an ExecutionAdapter.
// This preserves the Phase 4 direct wallet-signed flow as a fallback.
// It does NOT call KeeperHub — the user's own wallet signs the transaction.

import * as bridge from '../../security-layer/backend/bridge.js';
import { getGuardianContracts } from '../../security-layer/backend/registry.js';

const NAME = 'direct';

export const directAdapter = {
  getName() {
    return NAME;
  },

  /**
   * Simulate by preparing the transaction through the Phase 4 bridge.
   * @param {import('./adapterInterface.js').Workflow} workflow
   * @returns {Promise<import('./adapterInterface.js').SimulationResult>}
   */
  async simulate(workflow) {
    try {
      const contracts = await getGuardianContracts(workflow.chainId);
      if (!contracts) {
        return { success: false, wouldRevert: true, error: 'No contract deployment found', gasEstimate: null, from: null, to: null };
      }
      return {
        success: true,
        wouldRevert: false,
        gasEstimate: null,
        from: workflow.walletAddress,
        to: workflow.vaultAddress,
        error: null,
      };
    } catch (err) {
      return { success: false, wouldRevert: true, error: err.message, gasEstimate: null, from: null, to: null };
    }
  },

  /**
   * For the direct adapter, "execute" means returning the prepared payload
   * that the user's wallet must sign. No actual broadcast happens here.
   * @param {import('./adapterInterface.js').Workflow} workflow
   * @param {string} idempotencyKey — unused for direct (no KeeperHub)
   * @returns {Promise<import('./adapterInterface.js').ExecutionResult>}
   */
  async execute(workflow, _idempotencyKey) {
    return {
      success: true,
      executionId: workflow.workflowId,
      status: 'awaiting_wallet',
      transactionHash: null,
      transactionLink: null,
      error: null,
    };
  },

  /**
   * Status is tracked in our own transactions table, not KeeperHub.
   * @param {string} executionId — the workflowId / prepareId
   * @returns {Promise<import('./adapterInterface.js').ExecutionStatus>}
   */
  async getStatus(executionId) {
    try {
      const record = await bridge.getTransactionStatus(executionId);
      return {
        found: Boolean(record),
        executionId,
        status: record?.status || null,
        transactionHash: record?.txHash || null,
        transactionLink: null,
        receipts: record?.txHash ? [{ hash: record.txHash, verified: record.status === 'confirmed' }] : [],
        error: record?.errorMessage || null,
        pollIntervalHint: null,
      };
    } catch {
      return { found: false, executionId, status: null, transactionHash: null, transactionLink: null, receipts: [], error: 'Not found', pollIntervalHint: null };
    }
  },
};
