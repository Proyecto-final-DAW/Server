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
router.put(
  '/:userId',
  authentication,
  ensureSelf(),
  StatsController.updateStats
);
// Note: there used to be a `POST /stats/:userId/session` here that
// duplicated the streak update logic of `session.service.processSession`.
// Removed because no client called it (the actual session-save flow
// goes through `POST /sessions`) and keeping two sources of truth for
// streak math was a recipe for drift.
router.post('/init', authentication, StatsController.initStats);

export default router;
