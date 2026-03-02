import express from 'express';

import StatsController from '../controllers/StatsController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// All protected — require valid token
router.get('/', authentication, StatsController.getStats);
router.put('/', authentication, StatsController.updateStats);
router.post('/init', authentication, StatsController.initStats);

export default router;
