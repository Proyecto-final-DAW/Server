import express from 'express';

import ProfileController from '../controllers/ProfileController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/me', authentication, ProfileController.getProfile);
router.put('/me', authentication, ProfileController.updateProfile);
router.put('/me/password', authentication, ProfileController.changePassword);

export default router;
