import express from 'express';

import ProgressController from '../controllers/ProgressController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

router.get(
  '/:userId/weight',
  authentication,
  ensureSelf(),
  ProgressController.getWeightHistory
);
router.post(
  '/:userId/weight',
  authentication,
  ensureSelf(),
  ProgressController.registerWeight
);
router.get(
  '/:userId/exercise/:exerciseId',
  authentication,
  ensureSelf(),
  ProgressController.getExerciseMaxHistory
);
router.get(
  '/:userId/exercises-performed',
  authentication,
  ensureSelf(),
  ProgressController.getPerformedExercises
);

export default router;
