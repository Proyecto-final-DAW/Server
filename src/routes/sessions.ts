import express from 'express';

import SessionController from '../controllers/SessionController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.post('/', authentication, SessionController.create);
router.get('/weekly-summary', authentication, SessionController.weeklySummary);

export default router;
