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

// GDPR-compliant account deletion. Authentication-only (no extra
// confirmation) — the client surfaces a confirm dialog before calling.
router.delete('/me', authentication, UserController.deleteMe);

router.post(
  '/:userId/macros/calculate',
  authentication,
  ensureSelf(),
  validateBody(calculateMacrosSchema),
  MacrosController.calculate
);

// Note: there used to be a `GET /users/:userId/tips` here. Removed
// because no client called it and the underlying tips catalog only
// has one entry per category, so the random-pick logic was effectively
// dead. If tips come back, add the route AND the consumer in the same
// PR so the API doesn't ship orphan endpoints.

export default router;
