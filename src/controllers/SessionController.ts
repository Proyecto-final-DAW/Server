import { Response } from 'express';

import pool from '../db/pool';
import {
  CreateSessionExerciseInput,
  CreateSessionInput,
  CreateSessionSetInput,
  ExerciseType,
} from '../models/Session';
import * as sessionService from '../services/session.service';
import { sendServerError } from '../utils/httpError';
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

  const repsValid =
    typeof record.reps === 'number' &&
    Number.isFinite(record.reps) &&
    record.reps >= 0;
  const weightValid =
    typeof record.weight === 'number' &&
    Number.isFinite(record.weight) &&
    record.weight >= 0;

  if (!repsValid || !weightValid) return false;

  // Stretch / mobility sets log seconds instead of reps; the Zod validator
  // already enforced "reps > 0 OR duration_seconds present", so accept
  // either path here. Without this the controller rejects every stretch
  // set with reps=0 even though the body just passed validateBody.
  const hasDuration =
    typeof record.duration_seconds === 'number' &&
    Number.isFinite(record.duration_seconds) &&
    record.duration_seconds > 0;

  return (record.reps as number) > 0 || hasDuration;
};

const isValidExercise = (
  unknown: unknown
): unknown is CreateSessionExerciseInput => {
  if (!unknown || typeof unknown !== 'object') return false;
  const record = unknown as Record<string, unknown>;

  const baseValid =
    typeof record.exercise_api_id === 'string' &&
    record.exercise_api_id.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    VALID_TYPES.includes(record.type as ExerciseType) &&
    Array.isArray(record.sets) &&
    record.sets.every(isValidSet);

  if (!baseValid) return false;

  // Cardio entries log a duration_minutes instead of sets, so an empty
  // sets array is legitimate when a duration is provided. Strength
  // entries still require at least one set.
  const hasDuration =
    typeof record.duration_minutes === 'number' &&
    record.duration_minutes > 0;
  if (hasDuration) return true;

  return Array.isArray(record.sets) && record.sets.length > 0;
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
            'Each exercise must have exercise_api_id, name, type (strength|cardio|explosive|stretch), and either a non-empty sets array (each set: weight >= 0 plus reps > 0 OR duration_seconds > 0) or duration_minutes > 0 for cardio entries',
        });
      }

      // One-session-per-day rule. Mirrors the diet log: once you've
      // recorded today's session, the streak/XP rewards are locked in
      // and a second save would just be noise (XP already capped, no
      // streak change, but extra row in the DB and a confusing extra
      // "+0 XP" popup). Reject with 409 so the client can swap the
      // button to "ya entrenaste hoy".
      const existingToday = await pool.query<{ id: number }>(
        `SELECT id FROM sessions
          WHERE user_id = $1 AND date = $2
          LIMIT 1`,
        [userId, date]
      );
      if (existingToday.rowCount && existingToday.rowCount > 0) {
        return res.status(409).json({
          code: 'SESSION_ALREADY_LOGGED_TODAY',
          message:
            'Ya has registrado una sesion para esta fecha. Solo cuenta una sesion por dia.',
        });
      }

      const input: CreateSessionInput = {
        date,
        routine_id: typeof routine_id === 'number' ? routine_id : null,
        exercises,
      };

      const result = await sessionService.processSession(userId, input);
      return res.status(201).json(result);
    } catch (err: unknown) {
      const typedError = err as Error & { code?: string };
      if (typedError.code === 'STATS_NOT_FOUND') {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }
      // Race-condition fallback for the "one session per day" rule:
      // the pre-INSERT SELECT above narrows the window but two concurrent
      // saves can still both pass the check. The DB-side UNIQUE
      // (user_id, date) catches the duplicate (Postgres SQLSTATE 23505)
      // and we surface the same SESSION_ALREADY_LOGGED_TODAY code so the
      // client UI shows the friendly "ya entrenaste hoy" instead of a 500.
      if (typedError.code === '23505') {
        return res.status(409).json({
          code: 'SESSION_ALREADY_LOGGED_TODAY',
          message:
            'Ya has registrado una sesion para esta fecha. Solo cuenta una sesion por dia.',
        });
      }
      return sendServerError(res, err, 'SessionController.create');
    }
  },

  async getHistory(req: AuthRequest, res: Response) {
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
    } catch (err) {
      return sendServerError(res, err, 'SessionController.getHistory');
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
    } catch (err) {
      return sendServerError(res, err, 'SessionController.getDetail');
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
    } catch (err) {
      return sendServerError(res, err, 'SessionController.weeklySummary');
    }
  },
};

export default SessionController;
