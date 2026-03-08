import express from 'express';

import StatsController from '../controllers/StatsController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// All protected — require valid token
router.get('/:userId', authentication, StatsController.getStats);
router.put('/:userId', authentication, StatsController.updateStats);
router.post('/init', authentication, StatsController.initStats);

export default router;
