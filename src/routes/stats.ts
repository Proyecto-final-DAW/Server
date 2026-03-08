import express from 'express';

import StatsController from '../controllers/StatsController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

// All protected — require valid token
router.get('/:userId', authentication, ensureSelf, StatsController.getStats);
router.put('/:userId', authentication, ensureSelf, StatsController.updateStats);
router.post('/init', authentication, StatsController.initStats);

export default router;
