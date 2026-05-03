import express from 'express';

import ExercisesController from '../controllers/ExercisesController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

// Both endpoints proxy a paid third-party API (ExerciseDB on RapidAPI).
// Without authentication they are an open quota-drain surface for anyone
// on the internet — and the image route additionally fills an in-process
// cache keyed by arbitrary strings.
router.get('/', authentication, ExercisesController.search);
router.get('/image/:id', authentication, ExercisesController.image);

export default router;
