import express from 'express';

import MacrosController from '../controllers/MacrosController';
import UserController from '../controllers/UserController';
import { authentication } from '../middlewares/auth';
import {
  loginBruteforceProtection,
  registerBruteforceProtection,
} from '../middlewares/bruteforce';
import { ensureSelf } from '../middlewares/ensureSelf';
import { validateBody } from '../middlewares/validate';
import { loginSchema, registerSchema } from '../validators/auth';
import { calculateMacrosSchema } from '../validators/macros';

const router = express.Router();

// Auth
router.post(
  '/auth/register',
  registerBruteforceProtection,
  validateBody(registerSchema),
  UserController.register
);
router.post(
  '/auth/login',
  loginBruteforceProtection,
  validateBody(loginSchema),
  UserController.login
);
router.post('/auth/logout', authentication, UserController.logout);

router.get('/cards', authentication, UserController.getCards);
router.get('/stats', authentication, UserController.getStatsForCurrentUser);

router.post(
  '/:userId/macros/calculate',
  authentication,
  ensureSelf(),
  validateBody(calculateMacrosSchema),
  MacrosController.calculate
);

router.get(
  '/:userId/tips',
  authentication,
  ensureSelf(),
  UserController.getTip
);

export default router;
