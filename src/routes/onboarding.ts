import express from 'express';

import OnboardingController from '../controllers/OnboardingController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

// Onboarding
router.put(
  '/:userId/submit',
  authentication,
  ensureSelf(),
  OnboardingController.submitOnboarding
);

export default router;
