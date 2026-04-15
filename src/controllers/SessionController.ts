import { Response } from 'express';

import { ExerciseType } from '../models/SessionExercise';
import * as sessionService from '../services/session.service';
import { AuthRequest } from './UserController';

type SessionSetInput = {
  set_number: number;
  reps: number;
  weight: number;
};

type SessionExerciseInput = {
  exercise_name: string;
  exercise_api_id?: string | null;
  muscle_group: string;
  type: ExerciseType;
  sets: SessionSetInput[];
};

type CreateSessionBody = {
  routineId?: number | null;
  date?: string;
  notes?: string | null;
  exercises?: unknown[];
};

const isValidSet = (unknownSet: unknown): unknownSet is SessionSetInput => {
  if (!unknownSet || typeof unknownSet !== 'object') return false;

  const setRecord = unknownSet as Record<string, unknown>;

  return (
    typeof setRecord.set_number === 'number' &&
    setRecord.set_number > 0 &&
    typeof setRecord.reps === 'number' &&
    setRecord.reps > 0 &&
    typeof setRecord.weight === 'number' &&
    setRecord.weight >= 0
  );
};

const isValidExercise = (
  unknownExercise: unknown
): unknownExercise is SessionExerciseInput => {
  if (!unknownExercise || typeof unknownExercise !== 'object') return false;

  const exerciseRecord = unknownExercise as Record<string, unknown>;

  return (
    typeof exerciseRecord.exercise_name === 'string' &&
    exerciseRecord.exercise_name.trim().length > 0 &&
    (exerciseRecord.exercise_api_id === undefined ||
      exerciseRecord.exercise_api_id === null ||
      typeof exerciseRecord.exercise_api_id === 'string') &&
    typeof exerciseRecord.muscle_group === 'string' &&
    exerciseRecord.muscle_group.trim().length > 0 &&
    Array.isArray(exerciseRecord.sets) &&
    exerciseRecord.sets.length > 0 &&
    exerciseRecord.sets.every(isValidSet)
  );
};

const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return !Number.isNaN(new Date(value).getTime());
};

const SessionController = {
  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { routineId, date, notes, exercises } =
        req.body as CreateSessionBody;

      if (!isValidDate(date)) {
        return res.status(400).json({
          message: 'A valid date is required',
        });
      }

      if (
        routineId !== undefined &&
        routineId !== null &&
        typeof routineId !== 'number'
      ) {
        return res.status(400).json({
          message: 'routineId must be a number or null',
        });
      }

      if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        return res.status(400).json({
          message: 'notes must be a string or null',
        });
      }

      if (!Array.isArray(exercises) || exercises.length === 0) {
        return res.status(400).json({
          message: 'Exercises array is required and cannot be empty',
        });
      }

      if (!exercises.every(isValidExercise)) {
        return res.status(400).json({
          message:
            'Each exercise must include exercise_name, optional exercise_api_id, muscle_group, and a non-empty sets array with set_number, reps and weight',
        });
      }

      const sessionResult = await sessionService.processSession({
        userId,
        routineId: routineId ?? null,
        date: new Date(date),
        notes: notes ?? null,
        exercises,
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
