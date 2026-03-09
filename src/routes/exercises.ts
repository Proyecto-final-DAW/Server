import express from 'express';

import ExercisesController from '../controllers/ExercisesController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/', authentication, ExercisesController.search);

export default router;
