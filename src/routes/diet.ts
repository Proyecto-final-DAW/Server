import express from 'express';

import DietController from '../controllers/DietController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

router.get('/:userId', authentication, ensureSelf(), DietController.getDiet);

export default router;
