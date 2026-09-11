import { Router } from 'express';
import * as transactionController from './controller.js';

const router = Router();

router.get('/', transactionController.list);
router.post('/prepare', transactionController.prepare);
router.get('/:prepareId', transactionController.status);
router.post('/:prepareId/sign', transactionController.sign);
router.post('/:prepareId/verify', transactionController.verify);

export default router;