import express from 'express';

import RoutineController from '../controllers/RoutineController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/', authentication, RoutineController.getAll);
// `GET /routines/:id` removed — the client always reads the full list
// and selects locally, so the per-routine fetch was unused public
// surface. Re-add only with a real consumer.
router.post('/', authentication, RoutineController.create);
router.put('/:id', authentication, RoutineController.update);
router.delete('/:id', authentication, RoutineController.remove);

export default router;
