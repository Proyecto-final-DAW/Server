import express from 'express';

import ProfileController from '../controllers/ProfileController';
import { authentication } from '../middlewares/auth';
import { changePasswordBruteforceProtection } from '../middlewares/bruteforce';
import { validateBody } from '../middlewares/validate';
import {
  changePasswordSchema,
  updateProfileSchema,
} from '../validators/profile';

const router = express.Router();

router.get('/me', authentication, ProfileController.getProfile);
router.put(
  '/me',
  authentication,
  validateBody(updateProfileSchema),
  ProfileController.updateProfile
);
router.put(
  '/me/password',
  authentication,
  // Limiter goes BEFORE validateBody so the rate-limit cost is paid
  // before any bcrypt compare; an attacker with a stolen JWT cannot
  // grind `currentPassword` guesses past 5 failures / 15 min.
  changePasswordBruteforceProtection,
  validateBody(changePasswordSchema),
  ProfileController.changePassword
);

export default router;
