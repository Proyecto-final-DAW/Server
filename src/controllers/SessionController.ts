import { Response } from 'express';

import pool from '../db/pool';
import { CreateSessionInput } from '../models/Session';
import * as sessionService from '../services/session.service';
import { sendServerError } from '../utils/httpError';
import type { CreateSessionBody } from '../validators/session';
import { AuthRequest } from './UserController';

const SessionController = {
  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      // The route runs `validateBody(createSessionSchema)` upstream, so
      // the body is already shape-checked. Trust it. The previous in-
      // controller `isValidDate` / `isValidExercise` / `isValidSet`
      // helpers duplicated every Zod rule and made the controller look
      // like Zod wasn't trusted — confusing for future maintainers.
      const body = req.body as CreateSessionBody;

      // One-session-per-day rule. Mirrors the diet log: once you've
      // recorded today's session, the streak/XP rewards are locked in
      // and a second save would just be noise. Reject with 409 so the
      // client can swap the button to "ya entrenaste hoy". The DB
      // UNIQUE(user_id, date) backstops this against the race window.
      const existingToday = await pool.query<{ id: number }>(
        `SELECT id FROM sessions
          WHERE user_id = $1 AND date = $2
          LIMIT 1`,
        [userId, body.date]
      );
      if (existingToday.rowCount && existingToday.rowCount > 0) {
        return res.status(409).json({
          code: 'SESSION_ALREADY_LOGGED_TODAY',
          message:
            'Ya has registrado una sesion para esta fecha. Solo cuenta una sesion por dia.',
        });
      }

      const input: CreateSessionInput = {
        date: body.date,
        routine_id: body.routine_id ?? null,
        exercises: body.exercises as CreateSessionInput['exercises'],
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
      if (typedError.code === 'ROUTINE_NOT_OWNED') {
        // Don't leak whether the routine exists at all — `not found`
        // covers both "no such routine" and "exists but belongs to
        // another user". The client only ever passes routines from
        // `/routines` (i.e. its own), so a 404 here means tampering.
        return res.status(404).json({ message: 'Routine not found' });
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
