import express from 'express';

import ExercisesController from '../controllers/ExercisesController';

const router = express.Router();

router.get('/', ExercisesController.search);
router.get('/image/:id', ExercisesController.image);

export default router;
