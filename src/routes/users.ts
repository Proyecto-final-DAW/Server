import express from 'express';

import MacrosController from '../controllers/MacrosController';
import UserController from '../controllers/UserController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

// Auth
router.post('/auth/register', UserController.register);
router.post('/auth/login', UserController.login);
router.post('/auth/logout', authentication, UserController.logout);

router.post(
  '/:userId/macros/calculate',
  authentication,
  ensureSelf(),
  MacrosController.calculate
);

router.get(
  '/:userId/tips',
  authentication,
  ensureSelf(),
  UserController.getTips
);

export default router;
