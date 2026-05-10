import express from 'express';

import StatsController from '../controllers/StatsController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

// All protected — require valid token. `/history` is registered before
// the `/:userId` catch-all so Express matches it as a literal path
// rather than treating "history" as a userId param (which would 400 in
// ensureSelf).
router.get('/history', authentication, StatsController.getHistory);
router.get('/:userId', authentication, ensureSelf(), StatsController.getStats);
// `PUT /:userId` (StatsController.updateStats) was removed: the route
// allowlisted every `*_level` column, so any authenticated user could
// `PUT /stats/<my id>` with `{strength_level: 99, ...}` and instantly
// hit the T6 LEYENDA gate. Stats are derived data — they only move
// through `session.service.processSession` and `diet.service.logDietForToday`.
// No client ever called this endpoint (verified via grep on Client/src),
// so the deletion is safe.
//
// Note: there used to be a `POST /stats/:userId/session` here that
// duplicated the streak update logic of `session.service.processSession`.
// Removed because no client called it (the actual session-save flow
// goes through `POST /sessions`) and keeping two sources of truth for
// streak math was a recipe for drift.
router.post('/init', authentication, StatsController.initStats);

export default router;
