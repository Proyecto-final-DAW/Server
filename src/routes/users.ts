import express from 'express';

import UserController from '../controllers/UserController';
import { authentication } from '../middlewares/auth';
import {
  loginBruteforceProtection,
  registerBruteforceProtection,
} from '../middlewares/bruteforce';
import { validateBody } from '../middlewares/validate';
import { loginSchema, registerSchema } from '../validators/auth';

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

// Removed `POST /users/:userId/macros/calculate` — no client ever
// called it. Macros are recomputed server-side inside
// `profile.service.updateProfile` and `progress.service.registerWeight`
// transactions, so the standalone endpoint was dead surface area. If
// macros need to be standalone again, add the route AND a client
// consumer in the same PR so the API doesn't ship orphan endpoints.
//
// Note: there used to be a `GET /users/:userId/tips` here. Removed
// for the same reason — no consumer.

export default router;
