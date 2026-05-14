import express from 'express';

import ExercisesController from '../controllers/ExercisesController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// Exercises are served from a bundled local dataset (free-exercise-db),
// so this route does no upstream paid call. Auth still gates it because
// the rest of the user context (favourites, recently viewed, etc.) is
// derived from the authenticated user.
router.get('/', authentication, ExercisesController.search);

export default router;
