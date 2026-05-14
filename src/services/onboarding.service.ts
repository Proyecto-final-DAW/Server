import pool from '../db/pool';
import { OnboardingFormData } from '../models/Onboarding';
import { UserPublic } from '../models/User';
import { resolveMacroInputs } from '../utils/macroProfile';
import { calculateCalories } from './macros.service';
import { normalizeUserRow } from './user.service';

/** Maps onboarding request fields to `users` columns (single source of truth). */
function applyFormToUserUpdates(
  formData: OnboardingFormData,
  setParts: string[],
  values: unknown[]
): void {
  const push = (column: string, value: unknown, cast?: string): void => {
    values.push(value);
    const ph = `$${values.length}`;
    setParts.push(`${column} = ${cast ? `${ph}::${cast}` : ph}`);
  };

  (Object.entries(formData) as [keyof OnboardingFormData, unknown][]).forEach(
    ([key, raw]) => {
      if (raw === undefined || raw === '') {
        return;
      }

      switch (key) {
        case 'name': {
          const trimmed = String(raw).trim();
          if (trimmed) push('name', trimmed);
          break;
        }
        case 'birthDate': {
          const date = new Date(String(raw));
          if (!Number.isNaN(date.getTime())) {
            push('birth_date', date);
            // Also persist derived age — many endpoints (diet, dashboard
            // cards) and the profile view read `age` directly without
            // recomputing it from `birth_date`. Keeping them in sync at
            // write-time avoids null age + valid birth_date inconsistency.
            const today = new Date();
            let age = today.getUTCFullYear() - date.getUTCFullYear();
            const hadBirthday =
              today.getUTCMonth() > date.getUTCMonth() ||
              (today.getUTCMonth() === date.getUTCMonth() &&
                today.getUTCDate() >= date.getUTCDate());
            if (!hadBirthday) age -= 1;
            if (age >= 0) push('age', age);
          }
          break;
        }
        case 'weight': {
          const n = Number(raw);
          if (!Number.isNaN(n)) push('weight', n);
          break;
        }
        case 'height': {
          const n = Number(raw);
          if (!Number.isNaN(n)) push('height', n);
          break;
        }
        case 'sex':
          push('sex', raw, '"Sex"');
          break;
        case 'activityLevel':
          push('activity_level', raw);
          break;
        case 'goals': {
          const arr = Array.isArray(raw) ? raw : [];
          push('goals', arr, '"Goal"[]');
          break;
        }
        case 'experienceLevel':
          push('experience_level', raw, '"ExperienceLevel"');
          break;
        case 'equipment': {
          const arr = Array.isArray(raw) ? raw : [];
          push('equipment', arr, '"Equipment"[]');
          break;
        }
        case 'daysPerWeek':
          push('days_per_week', raw);
          break;
        case 'injuries': {
          const arr = Array.isArray(raw) ? raw : [];
          push('injuries', arr, '"Injury"[]');
          break;
        }
        case 'injuryNotes': {
          const trimmed = String(raw).trim();
          if (trimmed) push('injury_notes', trimmed);
          break;
        }
        default:
          break;
      }
    }
  );
}

/** Persists onboarding on `public.users` (name, profile fields, onboarding_completed).
 *
 * Wrapped in a single transaction so the profile UPDATE and the
 * derived-macros UPDATE either both commit or both roll back. The
 * earlier two-call version could leave a user with
 * `onboarding_completed = true` but no daily_calories/protein_grams
 * if `calculateCalories` threw — and `/diet` then 400s forever
 * because the onboarding gate already passed.
 */
export const submitOnboarding = async (
  userId: number,
  formData: OnboardingFormData
): Promise<UserPublic> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const status = await client.query(
      `SELECT (onboarding_completed IS TRUE) AS completed FROM users WHERE id = $1`,
      [userId]
    );
    const statusRow = status.rows[0];
    if (!statusRow) {
      const err = new Error('USER_NOT_FOUND');
      (err as Error & { code: string }).code = 'USER_NOT_FOUND';
      throw err;
    }
    if (statusRow.completed) {
      const err = new Error('ONBOARDING_ALREADY_COMPLETED');
      (err as Error & { code: string }).code = 'ONBOARDING_ALREADY_COMPLETED';
      throw err;
    }

    const setParts: string[] = ['onboarding_completed = $1'];
    const values: unknown[] = [true];

    applyFormToUserUpdates(formData, setParts, values);

    const setClause = setParts.join(', ');
    const idPlaceholder = values.length + 1;

    const result = await client.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${idPlaceholder} AND NOT (onboarding_completed IS TRUE) RETURNING *`,
      [...values, userId]
    );

    if (!result.rows[0]) {
      const err = new Error('ONBOARDING_UPDATE_FAILED');
      (err as Error & { code: string }).code = 'ONBOARDING_UPDATE_FAILED';
      throw err;
    }

    const row = normalizeUserRow(result.rows[0] as Record<string, unknown>);

    const inputs = resolveMacroInputs(row);
    if (inputs) {
      const targets = calculateCalories(
        inputs.weightKg,
        inputs.heightCm,
        inputs.age,
        inputs.sex,
        inputs.activityFactor,
        inputs.goal
      );
      await client.query(
        `UPDATE users
            SET daily_calories = $1, protein_grams = $2, fat_grams = $3, carb_grams = $4,
                updated_at = NOW()
          WHERE id = $5`,
        [
          targets.daily_calories,
          targets.protein_grams,
          targets.fat_grams,
          targets.carb_grams,
          userId,
        ]
      );
      // Reflect the macro fields in the returned user so the client
      // sees them on the same response without a follow-up GET.
      row.daily_calories = targets.daily_calories;
      row.protein_grams = targets.protein_grams;
      row.fat_grams = targets.fat_grams;
      row.carb_grams = targets.carb_grams;
    }

    // Atomically create the stats row inside the same transaction.
    // Previously the client made a separate POST /stats/init call
    // after onboarding submit — if that second call failed (network
    // blip, browser closed, 429) the user was permanently stuck:
    // re-submit threw ONBOARDING_ALREADY_COMPLETED, every session
    // save threw STATS_NOT_FOUND. ON CONFLICT keeps the explicit
    // /stats/init endpoint working as a defensive no-op for legacy
    // clients that still call it.
    await client.query(
      `INSERT INTO stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    await client.query('COMMIT');

    const { hashed_password: _hp, tokens: _tokens, ...user } = row;
    return user as UserPublic;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
};
