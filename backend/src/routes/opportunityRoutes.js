import { Router } from 'express';
import * as opportunityController from '../controllers/opportunityController.js';

const router = Router();

router.get('/', opportunityController.list);
router.post('/refresh', opportunityController.refresh);
router.get('/discovery', opportunityController.discovery);
router.get('/:id', opportunityController.getById);

export default router;