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

const isValidExercise = (
  unknownExercise: unknown
): unknownExercise is SessionExercise => {
  if (!unknownExercise || typeof unknownExercise !== 'object') return false;
  const exerciseRecord = unknownExercise as Record<string, unknown>;
  return (
    typeof exerciseRecord.exerciseId === 'string' &&
    typeof exerciseRecord.name === 'string' &&
    VALID_TYPES.includes(exerciseRecord.type as ExerciseType) &&
    typeof exerciseRecord.sets === 'number' &&
    exerciseRecord.sets > 0 &&
    typeof exerciseRecord.reps === 'number' &&
    exerciseRecord.reps > 0 &&
    typeof exerciseRecord.weight === 'number' &&
    exerciseRecord.weight >= 0
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

      const sessionResult = await sessionService.processSession(
        userId,
        exercises
      );
      return res.status(201).json(sessionResult);
    } catch (error: unknown) {
      const typedError = error as Error & { code?: string };
      if (typedError.code === 'STATS_NOT_FOUND') {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }
      return res.status(500).json({
        message: 'Failed to create session',
        error: typedError?.message || String(error),
      });
    }
  },

  async weeklySummary(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const summary = await sessionService.getWeeklySummary(userId);
      return res.status(200).json(summary);
    } catch (error: unknown) {
      const typedError = error as Error;
      return res.status(500).json({
        message: 'Failed to get weekly summary',
        error: typedError?.message || String(error),
      });
    }
  },
};

export default SessionController;
