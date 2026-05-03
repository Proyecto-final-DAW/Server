import { Response } from 'express';

import { calculateCalories } from '../services/macros.service';
import * as userService from '../services/user.service';
import type { CalculateMacrosBody } from '../validators/macros';
import { AuthRequest } from './UserController';

const MacrosController = {
  /**
   * POST `/users/:userId/macros/calculate`. Body shape and bounds enforced by
   * `calculateMacrosSchema` (see validators/macros.ts).
   *
   * Returns the computed targets. When `save: true`, also persists
   * `daily_calories` and the macro grams on the user.
   */
  async calculate(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { weightKg, heightCm, age, sex, activityFactor, goal, save } =
        req.body as CalculateMacrosBody;

      const targets = calculateCalories(
        weightKg,
        heightCm,
        age,
        sex,
        activityFactor,
        goal
      );

      if (save === true) {
        const updated = await userService.updateUserMacroTargets(userId, {
          weightKg,
          heightCm,
          age,
          sex,
          activityFactor,
          goal,
        });
        const { hashed_password: _, tokens: __, ...publicUser } = updated;
        return res.status(200).json({
          targets,
          user: publicUser,
        });
      }

      return res.status(200).json({ targets });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (err instanceof RangeError) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({
        message: 'Failed to calculate macros',
        error: error?.message || String(err),
      });
    }
  },
};

export default MacrosController;
