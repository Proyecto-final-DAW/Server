import { Response } from 'express';

import * as statsService from '../services/stats.service';
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
    } catch {
      return res.status(500).json({ message: 'Failed to get stats' });
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
    } catch {
      return res.status(500).json({ message: 'Failed to update stats' });
    }
  },

  async registerSession(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { session_date } = req.body as { session_date?: string };
      const date = session_date ? new Date(session_date) : undefined;

      if (date && isNaN(date.getTime())) {
        return res
          .status(400)
          .json({ message: 'Invalid session_date format. Use YYYY-MM-DD.' });
      }

      const result = await statsService.registerSession(userId, date);
      if (!result) {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }

      return res.status(200).json({
        streak: result.stats.streak,
        best_streak: result.stats.best_streak,
        last_session_date: result.stats.last_session_date,
        changed: result.changed,
      });
    } catch {
      return res.status(500).json({ message: 'Failed to register session' });
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
    } catch {
      return res.status(500).json({ message: 'Failed to initialize stats' });
    }
  },
};

export default StatsController;
