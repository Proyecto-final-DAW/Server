import express from 'express';

import RoutineController from '../controllers/RoutineController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/', authentication, RoutineController.getAll);
router.get('/:id', authentication, RoutineController.getById);
router.post('/', authentication, RoutineController.create);
router.put('/:id', authentication, RoutineController.update);
router.delete('/:id', authentication, RoutineController.remove);

export default router;
