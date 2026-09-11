import * as transactionService from './bridge.js';
import asyncHandler from '../../backend/src/utils/asyncHandler.js';
import { ok } from '../../backend/src/utils/response.js';

/** POST /api/transactions/prepare — risk-gated, server-derived prepare. */
export const prepare = asyncHandler(async (req, res) => {
  const prepared = await transactionService.prepareTransaction(req.body || {});
  return ok(res, { transaction: prepared });
});

/** GET /api/transactions/:prepareId — live status of a preparation. */
export const status = asyncHandler(async (req, res) => {
  const tx = await transactionService.getTransactionStatus(req.params.prepareId);
  return ok(res, { transaction: tx });
});

/** POST /api/transactions/:prepareId/sign — record the user-signed hash. */
export const sign = asyncHandler(async (req, res) => {
  const tx = await transactionService.recordUserTransaction(req.params.prepareId, req.body || {});
  return ok(res, { transaction: tx });
});

/** POST /api/transactions/:prepareId/verify — on-chain verification. */
export const verify = asyncHandler(async (req, res) => {
  const tx = await transactionService.verifyTransactionState(req.params.prepareId);
  return ok(res, { transaction: tx });
});

/** GET /api/transactions — recent transaction records for the activity feed. */
export const list = asyncHandler(async (_req, res) => {
  const items = await transactionService.listTransactionsForUser();
  return ok(res, { items });
});