import express from 'express';

import SessionController from '../controllers/SessionController';
import { authentication } from '../middlewares/auth';

const router = express.Router();

router.post('/', authentication, SessionController.create);

export default router;
