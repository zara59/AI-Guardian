// Phase 5: KeeperHub workflow controller.
//
// Express handlers for the /api/workflows/* routes.
// Every handler delegates to the workflow service — no KeeperHub-specific
// code lives in this layer.

import * as workflowService from './workflowService.js';
import { pollExecutionStatus } from './poller.js';
import asyncHandler from '../../backend/src/utils/asyncHandler.js';
import { ok } from '../../backend/src/utils/response.js';
import { getPhase6Config } from '../../full end to end execution and testing/backend/config.js';

/** POST /api/workflows/prepare — create a workflow for review. */
export const prepare = asyncHandler(async (req, res) => {
  const workflow = await workflowService.createWorkflow(req.body || {});
  return ok(res, { workflow });
});

/** POST /api/workflows/:workflowId/approve — user approves. */
export const approve = asyncHandler(async (req, res) => {
  const workflow = await workflowService.approveWorkflow(req.params.workflowId);
  return ok(res, { workflow });
});

/** POST /api/workflows/:workflowId/execute — send approved workflow to KeeperHub. */
export const execute = asyncHandler(async (req, res) => {
  const { approvalId } = req.body || {};
  if (!approvalId) {
    const err = new Error('approvalId is required');
    err.status = 400;
    throw err;
  }
  const workflow = await workflowService.executeWorkflow(
    approvalId,
    { preflightFunding: getPhase6Config().preflightFunding },
  );
  return ok(res, { workflow });
});

/** POST /api/workflows/:workflowId/execute-and-poll — send + poll to completion. */
export const executeAndPoll = asyncHandler(async (req, res) => {
  const { approvalId } = req.body || {};
  if (!approvalId) {
    const err = new Error('approvalId is required');
    err.status = 400;
    throw err;
  }
  const workflow = await workflowService.executeWorkflow(
    approvalId,
    { preflightFunding: getPhase6Config().preflightFunding },
  );
  if (workflow.khExecutionId && workflow.finalState !== 'failed') {
    const final = await pollExecutionStatus(workflow.workflowId);
    return ok(res, { workflow: final });
  }
  return ok(res, { workflow });
});

/** GET /api/workflows/:workflowId/status — current status. */
export const status = asyncHandler(async (req, res) => {
  const workflow = await workflowService.getWorkflowStatus(req.params.workflowId);
  return ok(res, { workflow });
});

/** POST /api/workflows/:workflowId/poll — poll KeeperHub once bounds. */
export const poll = asyncHandler(async (req, res) => {
  const maxAttempts = req.body?.maxAttempts || 12;
  const workflow = await pollExecutionStatus(req.params.workflowId, { maxAttempts });
  return ok(res, { workflow });
});

/** POST /api/workflows/:workflowId/reconcile — independent blockchain verify. */
export const reconcile = asyncHandler(async (req, res) => {
  const result = await workflowService.reconcileWorkflow(req.params.workflowId);
  return ok(res, result);
});

/** GET /api/workflows — recent workflows for the user. */
export const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const items = await workflowService.listWorkflowsForUser(Math.max(1, Math.min(100, limit)));
  return ok(res, { items });
});