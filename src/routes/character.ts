import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import CharacterController from '../controllers/CharacterController';
import { authentication } from '../middlewares/auth';
import { validateBody } from '../middlewares/validate';
import { chooseClassSchema } from '../validators/character';

const router = express.Router();

// The class catalog is build-time content: stable across requests, identical
// for every user. A long browser/CDN cache shaves load off the API and the
// 38-class JSON payload (~10KB).
const cacheCatalog = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  next();
};

router.get('/state', authentication, CharacterController.getState);
router.post(
  '/choose',
  authentication,
  validateBody(chooseClassSchema),
  CharacterController.choose
);
router.get(
  '/catalog',
  authentication,
  cacheCatalog,
  CharacterController.getCatalog
);

export default router;
