import { Router } from 'express';
import * as rankingController from '../controllers/rankingController.js';

const router = Router();

router.post('/', rankingController.create);
router.get('/', rankingController.history);

export default router;