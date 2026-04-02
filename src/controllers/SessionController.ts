import { Response } from 'express';

import { ExerciseType, SessionExercise } from '../models/Session';
import * as sessionService from '../services/session.service';
import { AuthRequest } from './UserController';

const VALID_TYPES: ExerciseType[] = [
  'strength',
  'cardio',
  'explosive',
  'stretch',
];

const isValidExercise = (e: unknown): e is SessionExercise => {
  if (!e || typeof e !== 'object') return false;
  const ex = e as Record<string, unknown>;
  return (
    typeof ex.exerciseId === 'string' &&
    typeof ex.name === 'string' &&
    VALID_TYPES.includes(ex.type as ExerciseType) &&
    typeof ex.sets === 'number' &&
    ex.sets > 0 &&
    typeof ex.reps === 'number' &&
    ex.reps > 0 &&
    typeof ex.weight === 'number' &&
    ex.weight >= 0
  );
};

const SessionController = {
  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { exercises } = req.body as { exercises?: unknown[] };
      if (!Array.isArray(exercises) || exercises.length === 0) {
        return res
          .status(400)
          .json({ message: 'Exercises array is required and cannot be empty' });
      }

      if (!exercises.every(isValidExercise)) {
        return res.status(400).json({
          message:
            'Each exercise must have exerciseId, name, type (strength|cardio|explosive|stretch), sets, reps and weight',
        });
      }

      const result = await sessionService.processSession(userId, exercises);
      return res.status(201).json(result);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      if (e.code === 'STATS_NOT_FOUND') {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }
      return res.status(500).json({ message: 'Failed to create session' });
    }
  },
};

export default SessionController;
