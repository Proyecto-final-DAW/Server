import { Response } from 'express';

import {
  WEIGHT_HISTORY_DEFAULT_LIMIT,
  WEIGHT_HISTORY_MAX_LIMIT,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
} from '../constants/limits';
import * as progressService from '../services/progress.service';
import { AuthRequest } from './UserController';

const ProgressController = {
  async getWeightHistory(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { limit, before } = req.query as {
        limit?: string;
        before?: string;
      };

      let parsedLimit = WEIGHT_HISTORY_DEFAULT_LIMIT;
      if (limit !== undefined) {
        const n = Number(limit);
        if (!Number.isInteger(n) || n <= 0 || n > WEIGHT_HISTORY_MAX_LIMIT) {
          return res.status(400).json({
            message: `limit must be an integer between 1 and ${WEIGHT_HISTORY_MAX_LIMIT}`,
          });
        }
        parsedLimit = n;
      }

      let parsedBefore: Date | undefined;
      if (before !== undefined) {
        const d = new Date(before);
        if (isNaN(d.getTime())) {
          return res
            .status(400)
            .json({ message: 'Invalid "before" date. Use YYYY-MM-DD.' });
        }
        parsedBefore = d;
      }

      const history = await progressService.getWeightHistory(userId, {
        limit: parsedLimit,
        before: parsedBefore,
      });
      return res.status(200).json(history);
    } catch {
      return res.status(500).json({ message: 'Failed to get weight history' });
    }
  },

  async registerWeight(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { weight, date } = req.body as { weight?: unknown; date?: unknown };

      const weightNum = Number(weight);
      if (
        !Number.isFinite(weightNum) ||
        weightNum < WEIGHT_KG_MIN ||
        weightNum > WEIGHT_KG_MAX
      ) {
        return res.status(400).json({
          message: `Weight must be a number between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg`,
        });
      }

      const entryDate = date ? new Date(date as string) : new Date();
      if (isNaN(entryDate.getTime())) {
        return res
          .status(400)
          .json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
      }

      const entry = await progressService.registerWeight(
        userId,
        weightNum,
        entryDate
      );
      return res.status(201).json(entry);
    } catch {
      return res.status(500).json({ message: 'Failed to register weight' });
    }
  },

  async getExerciseMaxHistory(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { exerciseId } = req.params as { exerciseId?: string };
      if (!exerciseId?.trim()) {
        return res.status(400).json({ message: 'exerciseId is required' });
      }

      const { tz } = req.query as { tz?: string };
      const timezone = typeof tz === 'string' && tz.trim() ? tz.trim() : 'UTC';

      const history = await progressService.getExerciseMaxHistory(
        userId,
        exerciseId.trim(),
        timezone
      );
      return res.status(200).json(history);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      // Postgres raises 22023 ("invalid_parameter_value") for unknown time zones
      if (e.code === '22023') {
        return res.status(400).json({ message: 'Invalid tz query parameter' });
      }
      return res
        .status(500)
        .json({ message: 'Failed to get exercise history' });
    }
  },
};

export default ProgressController;
