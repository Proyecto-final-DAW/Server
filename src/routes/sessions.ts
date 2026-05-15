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
router.get('/training-days', authentication, SessionController.getTrainingDays);

// `GET /sessions/detail/:sessionId` was unreachable — no client ever
// called it, the history endpoint already returns embedded exercises,
// and an unused public surface is a maintenance liability. Re-add only
// alongside a real consumer.

export default router;
