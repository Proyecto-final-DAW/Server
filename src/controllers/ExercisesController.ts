import { Request, Response } from 'express';

import * as exerciseService from '../services/exercise.service';
import { sendServerError } from '../utils/httpError';

const ExercisesController = {
  search(req: Request, res: Response) {
    try {
      const search = req.query.search as string | undefined;
      const muscle = req.query.muscle as string | undefined;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string) || 9, 1),
        50
      );

      const result = exerciseService.searchExercises(
        search,
        muscle,
        page,
        limit
      );

      return res.status(200).json(result);
    } catch (err) {
      return sendServerError(res, err, 'ExercisesController.search');
    }
  },
};

export default ExercisesController;
