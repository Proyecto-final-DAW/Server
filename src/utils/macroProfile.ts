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
 * Deterministic precedence for resolving the user's "primary" goal
 * when the form lets them check multiple. Picking `goals[0]` was
 * order-dependent and produced a 900 kcal swing between
 * `[GAIN_MUSCLE, LOSE_FAT]` and `[LOSE_FAT, GAIN_MUSCLE]` — same
 * payload, two different macro plans depending on click order.
 *
 * Order rationale: LOSE_FAT wins (caloric deficit is the most
 * restrictive constraint, ignoring it produces results the user
 * actively wants to avoid), then GAIN_MUSCLE (surplus), then MAINTAIN
 * (neutral), then HEALTH (the soft fallback).
 */
const GOAL_PRIORITY: readonly Goal[] = [
  'LOSE_FAT' as Goal,
  'GAIN_MUSCLE' as Goal,
  'MAINTAIN' as Goal,
  'HEALTH' as Goal,
];

const pickPrimaryGoal = (goals: readonly Goal[]): Goal => {
  for (const candidate of GOAL_PRIORITY) {
    if (goals.includes(candidate)) return candidate;
  }
  return goals[0];
};

/** Reasonable bound for our 14-and-up demographic. The macro formula
 *  rejects `age <= 0`, but a future birth_date / clock skew / wrong
 *  TZ can produce 0 or negative — the caller would then 500. We
 *  treat anything outside [14, 120] as a missing field instead. */
const MIN_AGE = 14;
const MAX_AGE = 120;

/**
 * Resolves the six inputs needed for Mifflin–St Jeor from a user row.
 * Returns null if any field is missing or cannot be mapped (including
 * out-of-range age).
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

  const age = ageFromBirthDate(new Date(user.birth_date as string | Date));
  if (!Number.isFinite(age) || age < MIN_AGE || age > MAX_AGE) {
    return null;
  }

  return {
    weightKg: Number(user.weight),
    heightCm: Number(user.height),
    age,
    sex: user.sex as Sex,
    activityFactor,
    goal: pickPrimaryGoal(goals),
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
