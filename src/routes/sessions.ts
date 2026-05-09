import express from 'express';

import SessionController from '../controllers/SessionController';
import { authentication } from '../middlewares/auth';
import { validateBody } from '../middlewares/validate';
import { createSessionSchema } from '../validators/session';

const router = express.Router();

router.post(
  '/',
  authentication,
  validateBody(createSessionSchema),
  SessionController.create
);
router.get('/weekly-summary', authentication, SessionController.weeklySummary);
router.get('/history', authentication, SessionController.getHistory);
router.get('/detail/:sessionId', authentication, SessionController.getDetail);

export default router;
