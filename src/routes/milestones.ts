import express from 'express';

import MilestoneController from '../controllers/MilestoneController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/', authentication, MilestoneController.getAll);
router.get('/me', authentication, MilestoneController.getUnlocked);

export default router;
