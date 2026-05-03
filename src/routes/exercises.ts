import express from 'express';

import ExercisesController from '../controllers/ExercisesController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// Search proxies a paid third-party API (ExerciseDB on RapidAPI). Keep it
// behind authentication so the quota can only be drained by signed-in users
// who are bounded by globalRateLimit/globalSlowdown.
router.get('/', authentication, ExercisesController.search);

// The image endpoint must remain unauthenticated: browsers cannot attach a
// Bearer token to <img src=...> requests, so authenticating here would break
// every exercise thumbnail in the UI. The API key is never exposed (it
// travels only in server-side request headers, see exercise.service.ts), and
// the in-process cache is bounded (see ExercisesController) so the blast
// radius of an unauthenticated visitor enumerating IDs is limited to the
// upstream RapidAPI cost — already mitigated by the 30-minute TTL.
router.get('/image/:id', ExercisesController.image);

export default router;
