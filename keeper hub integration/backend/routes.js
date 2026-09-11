// Phase 5: KeeperHub workflow routes.
//
// Mounted under /api/workflows. All KeeperHub execution endpoints live here.

import { Router } from 'express';
import * as workflowController from './controller.js';

const router = Router();

router.get('/', workflowController.list);
router.post('/prepare', workflowController.prepare);
router.post('/:workflowId/approve', workflowController.approve);
router.post('/:workflowId/execute', workflowController.execute);
router.post('/:workflowId/execute-and-poll', workflowController.executeAndPoll);
router.get('/:workflowId/status', workflowController.status);
router.post('/:workflowId/poll', workflowController.poll);
router.post('/:workflowId/reconcile', workflowController.reconcile);

export default router;