import { Response } from 'express';

import { calculateCalories } from '../services/macros.service';
import * as userService from '../services/user.service';
import { sendServerError } from '../utils/httpError';
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
    } catch (err) {
      if (err instanceof RangeError) {
        return res.status(400).json({ message: err.message });
      }
      return sendServerError(res, err, 'MacrosController.calculate');
    }
  },
};

export default MacrosController;
