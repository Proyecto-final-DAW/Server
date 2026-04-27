import express from 'express';

import OnboardingController from '../controllers/OnboardingController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';
import { validateBody } from '../middlewares/validate';
import { submitOnboardingSchema } from '../validators/onboarding';

const router = express.Router();

// Onboarding
router.put(
  '/:userId/submit',
  authentication,
  ensureSelf(),
  validateBody(submitOnboardingSchema),
  OnboardingController.submitOnboarding
);

export default router;
