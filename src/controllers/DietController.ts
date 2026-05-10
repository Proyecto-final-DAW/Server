import { Response } from 'express';

import * as dietService from '../services/diet.service';
import { sendServerError } from '../utils/httpError';
import { AuthRequest } from './UserController';

const DietController = {
  async getDiet(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      const macros = await dietService.getCurrentMacros(userId);
      return res.status(200).json(macros);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
      }
      if (error.code === 'ONBOARDING_INCOMPLETE') {
        return res.status(404).json({
          message: 'Diet not available. Complete onboarding first.',
        });
      }
      if (err instanceof RangeError) {
        return res.status(400).json({ message: err.message });
      }
      return sendServerError(res, err, 'DietController.getDiet');
    }
  },

  /**
   * GET /diet/state — current diet streak + whether the user already
   * logged today. Cheap read-only fetch the client uses to render the
   * "✓ DIETA HOY" / "✓ REGISTRADO HOY" button without bouncing through
   * the log endpoint.
   */
  async getState(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      // Single query — `isDietLoggedToday` previously re-ran
      // `getDietState`, doubling the round-trip on every dashboard
      // load. Build the comparison string with server-LOCAL date
      // components (matching the `localTodayISO` helper that the
      // write path used to store `last_diet_date`). A bare
      // `toISOString().slice(0,10)` would diverge in any TZ behind
      // UTC and falsely report `logged_today=false` after a session
      // logged late evening local.
      const state = await dietService.getDietState(userId);
      if (!state) {
        return res.status(404).json({ message: 'Stats not found' });
      }
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const loggedToday = state.last_diet_date === todayStr;
      return res.status(200).json({
        diet_streak: state.diet_streak,
        best_diet_streak: state.best_diet_streak,
        last_diet_date: state.last_diet_date,
        logged_today: loggedToday,
      });
    } catch (err) {
      return sendServerError(res, err, 'DietController.getState');
    }
  },

  /**
   * POST /diet/log — marks today as a diet day for the user. Idempotent
   * within the same day: a second call returns `alreadyLoggedToday=true`
   * with the unchanged streak instead of doubling it.
   */
  async logToday(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      const result = await dietService.logDietForToday(userId);
      if (!result) {
        return res.status(404).json({
          message: 'Stats not found. Complete onboarding first.',
        });
      }
      return res.status(200).json({
        diet_streak: result.diet_streak,
        best_diet_streak: result.best_diet_streak,
        last_diet_date: result.last_diet_date,
        already_logged_today: result.alreadyLoggedToday,
        vigor_before_xp: result.vigor_before_xp,
        vigor_before_level: result.vigor_before_level,
        vigor_after_xp: result.vigor_after_xp,
        vigor_after_level: result.vigor_after_level,
        vigor_delta: result.vigor_delta,
      });
    } catch (err) {
      return sendServerError(res, err, 'DietController.logToday');
    }
  },
};

export default DietController;
