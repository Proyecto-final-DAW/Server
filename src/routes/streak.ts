import express from 'express';

import StreakController from '../controllers/StreakController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/status', authentication, StreakController.getStatus);

export default router;
