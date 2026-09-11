import { Router } from 'express';
import * as preferenceController from '../controllers/preferenceController.js';

const router = Router();

router.get('/', preferenceController.get);
router.post('/', preferenceController.update);

export default router;