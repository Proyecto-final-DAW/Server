import express from 'express';

import DietController from '../controllers/DietController';
import { authentication } from '../middlewares/auth';
import { ensureSelf } from '../middlewares/ensureSelf';

const router = express.Router();

// Diet streak / daily log. These need to come BEFORE the `:userId`
// route or `/state` and `/log` would be parsed as user ids.
router.get('/state', authentication, DietController.getState);
router.post('/log', authentication, DietController.logToday);

router.get('/:userId', authentication, ensureSelf(), DietController.getDiet);

export default router;
