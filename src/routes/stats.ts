import express from 'express';

import StatsController from '../controllers/StatsController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// All protected — require valid token.
router.get('/history', authentication, StatsController.getHistory);
// `GET /stats/:userId` was an alias for `GET /users/stats` plus an
// `ensureSelf` guard, but no client ever called it. Removed to shrink
// the public surface; `GET /users/stats` (current user) covers every
// real consumer.
//
// `PUT /stats/:userId` (StatsController.updateStats) was removed
// previously: the route allowlisted every `*_level` column, so any
// authenticated user could PUT to bump their stats to T6 instantly.
// Stats are derived data only — they move through
// `session.service.processSession` and `diet.service.logDietForToday`.
//
// `POST /stats/:userId/session` likewise removed because no client
// called it and keeping two sources of truth for streak math was a
// recipe for drift.
router.post('/init', authentication, StatsController.initStats);

export default router;
