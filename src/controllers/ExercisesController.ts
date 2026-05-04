import { Request, Response } from 'express';

import * as exerciseService from '../services/exercise.service';

const ExercisesController = {
  async search(req: Request, res: Response) {
    try {
      const search = req.query.search as string | undefined;
      const muscle = req.query.muscle as string | undefined;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string) || 9, 1),
        50
      );

      const result = await exerciseService.searchExercises(
        search,
        muscle,
        page,
        limit
      );

      return res.status(200).json(result);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to fetch exercises',
        error: error?.message || String(err),
      });
    }
  },
};

export default ExercisesController;
