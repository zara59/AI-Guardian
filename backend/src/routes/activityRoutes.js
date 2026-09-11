import { Router } from 'express';
import * as activityController from '../controllers/activityController.js';

const router = Router();

router.get('/', activityController.list);

export default router;