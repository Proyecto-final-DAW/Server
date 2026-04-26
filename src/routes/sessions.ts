import express from 'express';

import SessionController from '../controllers/SessionController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

router.post('/', authentication, SessionController.create);
router.get('/weekly-summary', authentication, SessionController.weeklySummary);
router.get('/detail/:sessionId', authentication, SessionController.getDetail);
router.get('/:userId', authentication, ensureSelf(), SessionController.getAll);

export default router;
