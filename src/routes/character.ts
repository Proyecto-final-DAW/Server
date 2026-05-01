import express from 'express';

import CharacterController from '../controllers/CharacterController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.get('/state', authentication, CharacterController.getState);
router.post('/choose', authentication, CharacterController.choose);
router.get('/catalog', authentication, CharacterController.getCatalog);

export default router;
