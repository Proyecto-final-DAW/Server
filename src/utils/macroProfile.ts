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
    !user.birth_date ||
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
    age: ageFromBirthDate(new Date(user.birth_date as string | Date)),
    sex: user.sex as Sex,
    activityFactor,
    goal: goals[0],
  };
}

/**
 * Whole years since `birthDate`. Compares in UTC to match how Prisma stores
 * `@db.Date` (UTC midnight) and to stay independent of the server's TZ.
 */
function ageFromBirthDate(birthDate: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() &&
      today.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}
