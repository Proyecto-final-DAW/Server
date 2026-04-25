import express from 'express';

import MacrosController from '../controllers/MacrosController';
import UserController from '../controllers/UserController';
import { authentication } from '../middlewares/auth';
import {
  loginBruteforceProtection,
  registerBruteforceProtection,
} from '../middlewares/bruteforce';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

// Auth
router.post(
  '/auth/register',
  registerBruteforceProtection,
  UserController.register
);
router.post('/auth/login', loginBruteforceProtection, UserController.login);
router.post('/auth/logout', authentication, UserController.logout);

router.post(
  '/:userId/macros/calculate',
  authentication,
  ensureSelf(),
  MacrosController.calculate
);

export default router;
