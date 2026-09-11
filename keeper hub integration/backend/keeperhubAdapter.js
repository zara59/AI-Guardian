// Phase 5: KeeperHub execution adapter.
//
// Implements the ExecutionAdapter interface using KeeperHub's REST API.
// This adapter calls the REAL KeeperHub API — no simulation, no abstraction.
//
// The KeeperHub organization wallet (Turnkey-secured) executes the transaction.
// The user reviews and approves the workflow in AI Guardian, but KeeperHub
// performs the on-chain execution.

import * as client from './client.js';

const NAME = 'keeperhub';

function buildApproveArgs(workflow) {
  return JSON.stringify([workflow.strategyAddress, workflow.amountRaw]);
}

function buildDepositArgs(workflow) {
  // deposit(assets, receiver) — shares are minted to the user's wallet.
  return JSON.stringify([workflow.amountRaw, workflow.walletAddress]);
}

function buildWithdrawArgs(workflow) {
  // withdraw(assets, receiver, owner) — owner authorizes, receiver gets funds.
  return JSON.stringify([workflow.amountRaw, workflow.walletAddress, workflow.walletAddress]);
}

function buildRequestBody(workflow) {
  const args =
    workflow.operation === 'approve'
      ? buildApproveArgs(workflow)
      : workflow.operation === 'deposit'
        ? buildDepositArgs(workflow)
        : buildWithdrawArgs(workflow);

  const functionName =
    workflow.operation === 'approve'
      ? 'approve'
      : workflow.operation === 'deposit'
        ? 'deposit'
        : 'withdraw';

  return {
    contractAddress: workflow.vaultAddress,
    chainId: workflow.chainId,
    functionName,
    functionArgs: args,
  };
}

export const keeperHubAdapter = {
  getName() {
    return NAME;
  },

  /**
   * Simulate a workflow execution via KeeperHub (dry-run, no broadcast).
   * @param {import('./adapterInterface.js').Workflow} workflow
   * @returns {Promise<import('./adapterInterface.js').SimulationResult>}
   */
  async simulate(workflow) {
    const body = buildRequestBody(workflow);
    const result = await client.simulateContractCall(body);

    return {
      success: result.success === true,
      wouldRevert: result.wouldRevert === true,
      gasEstimate: result.gasEstimate || null,
      from: result.from || null,
      to: result.to || null,
      error: result.error || null,
      failureKind: result.failureKind || null,
      code: result.code || null,
    };
  },

  /**
   * Execute a workflow via KeeperHub (broadcasts a real transaction).
   * @param {import('./adapterInterface.js').Workflow} workflow
   * @param {string} idempotencyKey
   * @returns {Promise<import('./adapterInterface.js').ExecutionResult>}
   */
  async execute(workflow, idempotencyKey) {
    const body = buildRequestBody(workflow);
    const result = await client.executeContractCall(body, idempotencyKey);

    if (result.conflict) {
      return {
        success: false,
        executionId: result.originalExecutionId || null,
        status: 'conflict',
        transactionHash: null,
        transactionLink: null,
        error: result.error || 'Duplicate execution detected',
        conflict: true,
        originalExecutionId: result.originalExecutionId,
        retryable: result.retryable,
      };
    }

    return {
      success: result.success === true,
      executionId: result.executionId || null,
      status: result.status || null,
      transactionHash: result.transactionHash || null,
      transactionLink: result.transactionLink || null,
      error: result.error || null,
    };
  },

  /**
   * Get the status of a KeeperHub execution.
   * @param {string} executionId
   * @returns {Promise<import('./adapterInterface.js').ExecutionStatus>}
   */
  async getStatus(executionId) {
    const result = await client.getExecutionStatus(executionId);

    if (!result.found) {
      return { found: false, executionId, status: null, transactionHash: null, transactionLink: null, receipts: [], error: result.error || 'Execution not found', pollIntervalHint: null };
    }

    return {
      found: true,
      executionId: result.executionId,
      status: result.status,
      transactionHash: result.transactionHash,
      transactionLink: result.transactionLink,
      receipts: result.receipts || [],
      gasUsedWei: result.gasUsedWei,
      sponsored: result.sponsored,
      error: result.error,
      createdAt: result.createdAt,
      completedAt: result.completedAt,
      pollIntervalHint: result.pollIntervalHint,
    };
  },
};
