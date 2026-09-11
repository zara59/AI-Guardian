// Phase 5: Execution adapter interface.
//
// Every execution adapter (KeeperHub, Direct) must implement this contract.
// The WorkflowService never calls KeeperHub or the wallet directly — it only
// calls through this interface.

/**
 * @typedef {object} Workflow
 * @property {string} workflowId
 * @property {string} approvalId
 * @property {number} opportunityId
 * @property {number} chainId
 * @property {string} tokenAddress
 * @property {number} tokenDecimals
 * @property {string} vaultAddress
 * @property {string|null} strategyAddress
 * @property {string} operation — 'approve' | 'deposit' | 'withdraw'
 * @property {string} amountRaw
 * @property {string} amountHuman
 * @property {string} walletAddress
 * @property {string} workflowHash
 * @property {string} expiresAt
 */

/**
 * @typedef {object} SimulationResult
 * @property {boolean} success
 * @property {boolean} wouldRevert
 * @property {string|null} gasEstimate
 * @property {string|null} from
 * @property {string|null} to
 * @property {string|null} error
 */

/**
 * @typedef {object} ExecutionResult
 * @property {boolean} success
 * @property {string|null} executionId
 * @property {string|null} status
 * @property {string|null} transactionHash
 * @property {string|null} transactionLink
 * @property {string|null} error
 * @property {boolean} [conflict]
 * @property {string|null} [originalExecutionId]
 */

/**
 * @typedef {object} ExecutionStatus
 * @property {boolean} found
 * @property {string} executionId
 * @property {string|null} status
 * @property {string|null} transactionHash
 * @property {string|null} transactionLink
 * @property {Array} receipts
 * @property {string|null} error
 * @property {number|null} pollIntervalHint
 */

/**
 * @interface ExecutionAdapter
 */
export const ADAPTER_METHODS = [
  'simulate',
  'execute',
  'getStatus',
  'getName',
];

/**
 * Validate that an object implements the ExecutionAdapter interface.
 * @param {object} adapter
 * @throws if any method is missing
 */
export function assertAdapter(adapter) {
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Adapter missing required method: ${method}`);
    }
  }
}
