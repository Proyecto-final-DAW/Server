import { Goal, Sex } from '@prisma/client';
import { Response } from 'express';

import { calculateCalories } from '../services/macros.service';
import * as userService from '../services/user.service';
import { AuthRequest } from './UserController';

function parseSex(value: unknown): Sex | null {
  if (typeof value !== 'string') return null;
  return Object.values(Sex).includes(value as Sex) ? (value as Sex) : null;
}

function parseGoal(value: unknown): Goal | null {
  if (typeof value !== 'string') return null;
  return Object.values(Goal).includes(value as Goal) ? (value as Goal) : null;
}

const MacrosController = {
  /**
   * POST body: weightKg, heightCm, age, sex (MALE|FEMALE), activityFactor (1.2–1.9), goal (LOSE_FAT|GAIN_MUSCLE|MAINTAIN|HEALTH).
   * Optional save: true — persists daily_calories and macro grams on the user.
   */
  async calculate(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const body = req.body as {
        weightKg?: unknown;
        heightCm?: unknown;
        age?: unknown;
        sex?: unknown;
        activityFactor?: unknown;
        goal?: unknown;
        save?: unknown;
      };

      const weightKg = Number(body.weightKg);
      const heightCm = Number(body.heightCm);
      const age = Number(body.age);
      const activityFactor = Number(body.activityFactor);
      const sex = parseSex(body.sex);
      const goal = parseGoal(body.goal);

      if (sex === null) {
        return res.status(400).json({
          message: 'Invalid or missing sex; use MALE or FEMALE',
        });
      }
      if (goal === null) {
        return res.status(400).json({
          message:
            'Invalid or missing goal; use LOSE_FAT, GAIN_MUSCLE, MAINTAIN, or HEALTH',
        });
      }

      const targets = calculateCalories(
        weightKg,
        heightCm,
        age,
        sex,
        activityFactor,
        goal
      );

      if (body.save === true) {
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
      if (err instanceof RangeError) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: 'Failed to calculate macros' });
    }
  },
};

export default MacrosController;
