import { Response } from 'express';

import * as statsService from '../services/stats.service';
import { sendServerError } from '../utils/httpError';
import { AuthRequest } from './UserController';

const StatsController = {
  async getStats(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const stats = await statsService.findByUserId(userId);
      if (!stats) {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }

      return res.status(200).json(stats);
    } catch (err) {
      return sendServerError(res, err, 'StatsController.getStats');
    }
  },

  async updateStats(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const allowedFields = [
        'strength',
        'endurance',
        'stamina',
        'agility',
        'tenacity',
        'vigor',
        'strength_level',
        'endurance_level',
        'stamina_level',
        'agility_level',
        'tenacity_level',
        'vigor_level',
      ];

      const data = req.body as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const key of Object.keys(data)) {
        if (allowedFields.includes(key)) {
          filtered[key] = data[key];
        }
      }

      if (Object.keys(filtered).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      const updated = await statsService.updateStats(userId, filtered);
      if (!updated) {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }

      return res.status(200).json(updated);
    } catch (err) {
      return sendServerError(res, err, 'StatsController.updateStats');
    }
  },

  async initStats(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const exists = await statsService.existsForUser(userId);
      if (exists) {
        return res.status(409).json({ message: 'Stats already initialized' });
      }

      const stats = await statsService.createStats(userId);
      return res.status(201).json(stats);
    } catch (err) {
      return sendServerError(res, err, 'StatsController.initStats');
    }
  },

  /**
   * GET /stats/history — chronological per-session level snapshots.
   * Powers the /progress radar's time selector ("AHORA / HACE 7D /
   * HACE 30D / INICIO"); replayed from the session table because the
   * stored stat values aren't time-stamped per save.
   */
  async getHistory(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : undefined;
      const safeLimit =
        limit !== undefined && Number.isFinite(limit) && limit > 0
          ? Math.min(500, limit)
          : 200;
      const history = await statsService.getStatHistory(userId, safeLimit);
      return res.status(200).json(history);
    } catch (err) {
      return sendServerError(res, err, 'StatsController.getHistory');
    }
  },
};

export default StatsController;
