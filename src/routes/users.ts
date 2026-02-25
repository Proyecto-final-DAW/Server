import express from 'express';

import UserController from '../controllers/UserController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// Auth
router.post('/auth/register', UserController.register);
router.post('/auth/login', UserController.login);
router.post('/auth/logout', authentication, UserController.logout);

export default router;
