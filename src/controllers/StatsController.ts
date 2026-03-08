import { Response } from 'express';

import * as statsService from '../services/stats.service';
import { AuthRequest } from './UserController';

const StatsController = {
  async getStats(req: AuthRequest, res: Response) {
    try {
      const paramId = parseInt(req.params['userId'] as string, 10);
      if (!paramId || isNaN(paramId)) {
        return res.status(400).json({ message: 'Invalid userId param' });
      }

      if (req.user?.id !== paramId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const stats = await statsService.findByUserId(paramId);
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
      const paramId = parseInt(req.params['userId'] as string, 10);
      if (!paramId || isNaN(paramId)) {
        return res.status(400).json({ message: 'Invalid userId param' });
      }

      if (req.user?.id !== paramId) {
        return res.status(403).json({ message: 'Forbidden' });
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
        'streak',
        'best_streak',
        'last_session_date',
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

      const updated = await statsService.updateStats(paramId, filtered);
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
