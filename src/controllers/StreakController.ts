import { Response } from 'express';

import {
  countTrainingDaysInWeek,
  getUserWeeklyTarget,
} from '../services/session.service';
import * as statsService from '../services/stats.service';
import {
  calculateStreakStatus,
  isoWeekMonday,
} from '../services/streak.service';
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

      // Routine-target streak status needs both the user's target
      // (from `days_per_week`) and the count of distinct training
      // days so far this ISO week. The dashboard combines these to
      // surface "X / Y sesiones esta semana" and the at-risk warning.
      const now = new Date();
      const thisWeekMonday = isoWeekMonday(now);
      const [target, sessionsThisWeek] = await Promise.all([
        getUserWeeklyTarget(userId),
        countTrainingDaysInWeek(userId, thisWeekMonday),
      ]);

      const status = calculateStreakStatus(
        {
          streak: stats.streak ?? 0,
          best_streak: stats.best_streak ?? 0,
          last_session_date: stats.last_session_date
            ? new Date(stats.last_session_date)
            : null,
          last_qualifying_week_monday: stats.last_qualifying_week_monday
            ? new Date(stats.last_qualifying_week_monday)
            : null,
        },
        target,
        sessionsThisWeek,
        now
      );

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
