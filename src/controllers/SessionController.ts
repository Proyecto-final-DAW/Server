import { Response } from 'express';

import * as sessionService from '../services/session.service';
import {
  CreateSessionBody,
  CreateSessionServiceInput,
  validateCreateSessionBody,
} from '../services/session.validator';
import { AuthRequest } from './UserController';

const SessionController = {
  // TODO(PROJ-123): Add getAll / getById endpoints for sessions (follow-up task)
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

      const validation = validateCreateSessionBody(
        req.body as Partial<CreateSessionBody>
      );

      if (!validation.ok) {
        return res.status(400).json({ message: validation.error });
      }

      const sessionInput: CreateSessionServiceInput = {
        userId,
        routineId: validation.data.routineId,
        date: new Date(validation.data.date),
        notes: validation.data.notes,
        exercises: validation.data.exercises,
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
