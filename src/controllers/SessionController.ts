import { Response } from 'express';

import {
  CreateSessionInput,
  SessionExerciseInput,
  getSessionValidationError,
  isValidDate,
} from '../helpers/session.helper';
import * as sessionService from '../services/session.service';
import { AuthRequest } from './UserController';

const SessionController = {
  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { routineId, date, notes, exercises } =
        req.body as CreateSessionInput;

      if (!isValidDate(date)) {
        return res.status(400).json({
          message: 'A valid date is required',
        });
      }

      const validationError = getSessionValidationError({
        routineId,
        notes,
        exercises,
      });

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const validExercises = exercises as SessionExerciseInput[];

      const sessionResult = await sessionService.processSession({
        userId,
        routineId: routineId ?? null,
        date: new Date(date),
        notes: notes ?? null,
        exercises: validExercises,
      });

      return res.status(201).json(sessionResult);
    } catch (error: unknown) {
      const typedError = error as Error & { code?: string };

      if (typedError.code === 'STATS_NOT_FOUND') {
        return res.status(404).json({
          message: 'Stats not found. Complete onboarding first.',
        });
      }

      return res.status(500).json({ message: 'Failed to create session' });
    }
  },
};

export default SessionController;
