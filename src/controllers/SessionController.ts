import { Response } from 'express';

import {
  CreateSessionExerciseInput,
  CreateSessionInput,
  CreateSessionSetInput,
  ExerciseType,
} from '../models/Session';
import * as sessionService from '../services/session.service';
import { AuthRequest } from './UserController';

const VALID_TYPES: ExerciseType[] = [
  'strength',
  'cardio',
  'explosive',
  'stretch',
];

const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const isValidSet = (unknown: unknown): unknown is CreateSessionSetInput => {
  if (!unknown || typeof unknown !== 'object') return false;
  const record = unknown as Record<string, unknown>;
  return (
    typeof record.reps === 'number' &&
    Number.isFinite(record.reps) &&
    record.reps > 0 &&
    typeof record.weight === 'number' &&
    Number.isFinite(record.weight) &&
    record.weight >= 0
  );
};

const isValidExercise = (
  unknown: unknown
): unknown is CreateSessionExerciseInput => {
  if (!unknown || typeof unknown !== 'object') return false;
  const record = unknown as Record<string, unknown>;
  return (
    typeof record.exercise_api_id === 'string' &&
    record.exercise_api_id.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    VALID_TYPES.includes(record.type as ExerciseType) &&
    Array.isArray(record.sets) &&
    record.sets.length > 0 &&
    record.sets.every(isValidSet)
  );
};

const SessionController = {
  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { date, routine_id, exercises } = req.body as {
        date?: unknown;
        routine_id?: unknown;
        exercises?: unknown;
      };

      if (!isValidDate(date)) {
        return res.status(400).json({
          message: 'date is required in YYYY-MM-DD format',
        });
      }

      if (
        routine_id !== undefined &&
        routine_id !== null &&
        (typeof routine_id !== 'number' || routine_id <= 0)
      ) {
        return res.status(400).json({
          message: 'routine_id must be null or a positive integer',
        });
      }

      if (!Array.isArray(exercises) || exercises.length === 0) {
        return res.status(400).json({
          message: 'exercises array is required and cannot be empty',
        });
      }

      if (!exercises.every(isValidExercise)) {
        return res.status(400).json({
          message:
            'Each exercise must have exercise_api_id, name, type (strength|cardio|explosive|stretch), and a non-empty sets array with { reps > 0, weight >= 0 }',
        });
      }

      const input: CreateSessionInput = {
        date,
        routine_id: typeof routine_id === 'number' ? routine_id : null,
        exercises,
      };

      const result = await sessionService.processSession(userId, input);
      return res.status(201).json(result);
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

  async getAll(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const pageRaw = req.query.page;
      const limitRaw = req.query.limit;
      const page =
        typeof pageRaw === 'string' ? parseInt(pageRaw, 10) : undefined;
      const limit =
        typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : undefined;

      const result = await sessionService.getUserSessions(userId, {
        page: page !== undefined && !Number.isNaN(page) ? page : undefined,
        limit: limit !== undefined && !Number.isNaN(limit) ? limit : undefined,
      });
      return res.status(200).json(result);
    } catch {
      return res.status(500).json({ message: 'Failed to fetch sessions' });
    }
  },

  async getDetail(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const sessionId = parseInt(req.params.sessionId as string, 10);
      if (Number.isNaN(sessionId) || sessionId <= 0) {
        return res.status(400).json({ message: 'Invalid sessionId' });
      }

      const session = await sessionService.getSessionDetail(userId, sessionId);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      return res.status(200).json(session);
    } catch {
      return res
        .status(500)
        .json({ message: 'Failed to fetch session detail' });
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
