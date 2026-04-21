import { Response } from 'express';

import * as sessionService from '../services/session.service';
import {
  CreateSessionBody,
  CreateSessionServiceInput,
  SessionExerciseInput,
  getSessionValidationError,
} from '../services/session.validator';
import { AuthRequest } from './UserController';

const SessionController = {
  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      if (
        !req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body)
      ) {
        return res.status(400).json({
          message: 'Request body must be an object',
        });
      }

      const { routineId, date, notes, exercises } =
        req.body as Partial<CreateSessionBody>;

      const validationError = getSessionValidationError({
        routineId,
        date,
        notes,
        exercises,
      });

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      if (typeof date !== 'string' || !Array.isArray(exercises)) {
        return res.status(400).json({
          message: 'Invalid session payload',
        });
      }

      const sessionInput: CreateSessionServiceInput = {
        userId,
        routineId: routineId ?? null,
        date: new Date(date),
        notes: notes ?? null,
        exercises: exercises as SessionExerciseInput[],
      };

      const sessionResult = await sessionService.processSession(sessionInput);

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
