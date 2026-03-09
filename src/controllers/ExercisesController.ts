import { Response } from 'express';

import * as exerciseService from '../services/exercise.service';
import { AuthRequest } from './UserController';

const ExercisesController = {
  async search(req: AuthRequest, res: Response) {
    try {
      const search = req.query.search as string | undefined;
      const muscle = req.query.muscle as string | undefined;

      const exercises = await exerciseService.searchExercises(search, muscle);

      return res.status(200).json(exercises);
    } catch {
      return res.status(500).json({ message: 'Failed to fetch exercises' });
    }
  },
};

export default ExercisesController;
