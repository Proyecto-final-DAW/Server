import type { Goal, Sex } from '@prisma/client';

import { ACTIVITY_FACTOR_MAP } from '../services/macros.service';

export interface MacroInputs {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityFactor: number;
  goal: Goal;
}

/**
 * Resolves the six inputs needed for Mifflin–St Jeor from a user row.
 * Returns null if any field is missing or cannot be mapped.
 */
export function resolveMacroInputs(
  user: Record<string, unknown>
): MacroInputs | null {
  const goals = user.goals as Goal[] | undefined;
  if (
    !user.weight ||
    !user.height ||
    !user.age ||
    !user.sex ||
    !user.activity_level ||
    !Array.isArray(goals) ||
    goals.length === 0
  ) {
    return null;
  }

  const activityFactor = ACTIVITY_FACTOR_MAP[user.activity_level as string];
  if (!activityFactor) return null;

  return {
    weightKg: Number(user.weight),
    heightCm: Number(user.height),
    age: Number(user.age),
    sex: user.sex as Sex,
    activityFactor,
    goal: goals[0],
  };
}
