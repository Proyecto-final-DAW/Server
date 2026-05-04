import pool from '../db/pool';
import { resolveMacroInputs } from '../utils/macroProfile';
import { calculateCalories, MacroTargets } from './macros.service';
import { normalizeUserRow } from './user.service';

function throwCoded(message: string, code: string): never {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  throw err;
}

/**
 * Returns the user's current macro targets.
 *
 * Recalculates with Mifflin–St Jeor whenever the stored daily_calories /
 * protein / fat / carbs drift from what the current weight, goal, and other
 * profile inputs imply — keeping the diet in sync without a separate
 * "recalc" endpoint.
 *
 * Throws ONBOARDING_INCOMPLETE if the user hasn't finished onboarding
 * or is missing any macro input.
 */
export async function getCurrentMacros(userId: number): Promise<MacroTargets> {
  // `birth_date` (not `age`) is what resolveMacroInputs reads to compute
  // the Mifflin–St Jeor age input — selecting only `age` made every diet
  // request 404 with ONBOARDING_INCOMPLETE because birth_date came back
  // as undefined.
  const result = await pool.query(
    `SELECT onboarding_completed, weight, height, birth_date, sex, activity_level, goals,
            daily_calories, protein_grams, fat_grams, carb_grams
       FROM users WHERE id = $1`,
    [userId]
  );

  const rawUser = result.rows[0];
  if (!rawUser) {
    throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
  }

  // Normalize Postgres enum-array columns (goals, injuries, equipment) into
  // JS arrays. Without this, `Array.isArray(user.goals)` in resolveMacroInputs
  // would fail and every diet request would 404 with ONBOARDING_INCOMPLETE.
  const user = normalizeUserRow(rawUser);

  const inputs = user.onboarding_completed ? resolveMacroInputs(user) : null;
  if (!inputs) {
    throwCoded('ONBOARDING_INCOMPLETE', 'ONBOARDING_INCOMPLETE');
  }

  const computed = calculateCalories(
    inputs.weightKg,
    inputs.heightCm,
    inputs.age,
    inputs.sex,
    inputs.activityFactor,
    inputs.goal
  );

  const drifted =
    user.daily_calories !== computed.daily_calories ||
    user.protein_grams !== computed.protein_grams ||
    user.fat_grams !== computed.fat_grams ||
    user.carb_grams !== computed.carb_grams;

  if (drifted) {
    await pool.query(
      `UPDATE users
          SET daily_calories = $1, protein_grams = $2, fat_grams = $3, carb_grams = $4,
              updated_at = NOW()
        WHERE id = $5`,
      [
        computed.daily_calories,
        computed.protein_grams,
        computed.fat_grams,
        computed.carb_grams,
        userId,
      ]
    );
  }

  return computed;
}
