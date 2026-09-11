import { Router } from 'express';
import * as guardianController from '../controllers/guardianController.js';

const router = Router();

router.get('/status', guardianController.status);

export default router;