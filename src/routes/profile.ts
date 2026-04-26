import express from 'express';

import ProfileController from '../controllers/ProfileController';
import { authentication } from '../middlewares/auth';
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
  validateBody(changePasswordSchema),
  ProfileController.changePassword
);

export default router;
