import { Response } from 'express';

import * as statsService from '../services/stats.service';
import { calculateStreakStatus } from '../services/streak.service';
import { AuthRequest } from './UserController';

const StreakController = {
  async getStatus(req: AuthRequest, res: Response) {
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

      const status = calculateStreakStatus({
        streak: stats.streak ?? 0,
        last_session_date: stats.last_session_date
          ? new Date(stats.last_session_date)
          : null,
      });

      return res.status(200).json(status);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to get streak status',
        error: error?.message || String(err),
      });
    }
  },
};

export default StreakController;
