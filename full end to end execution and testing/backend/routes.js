// Phase 6 routes — mounted under /api/phase6.
//
// Readiness / funding / state / audit are GET diagnostics.
// Reconcile is an explicit, idempotent trigger.

import { Router } from 'express';
import * as controller from './controller.js';

const router = Router();

router.get('/readiness', controller.readiness);
router.get('/funding', controller.funding);
router.get('/vault-state', controller.vaultState);
router.get('/states', controller.states);
router.get('/audit', controller.audit);
router.get('/state/:workflowId', controller.workflowState);
router.post('/reconcile/:workflowId', controller.reconcile);
router.post('/reconcile/stuck', controller.reconcileStuckBatch);

export default router;