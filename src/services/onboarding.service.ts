import pool from '../db/pool';
import { OnboardingFormData } from '../models/Onboarding';
import { UserPublic } from '../models/User';

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
          if (!Number.isNaN(date.getTime())) push('birth_date', date);
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
        case 'equipment':
          push('equipment', raw, '"Equipment"');
          break;
        case 'daysPerWeek':
          push('days_per_week', raw);
          break;
        case 'injuries': {
          const arr = Array.isArray(raw) ? raw : [];
          push('injuries', arr, '"Injury"[]');
          break;
        }
        default:
          break;
      }
    }
  );
}

/** Persists onboarding on `public.users` (name, profile fields, onboarding_completed). */
export const submitOnboarding = async (
  userId: number,
  formData: OnboardingFormData
): Promise<UserPublic> => {
  const status = await pool.query(
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

  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${idPlaceholder} AND NOT (onboarding_completed IS TRUE) RETURNING *`,
    [...values, userId]
  );

  if (result.rows[0]) {
    const { hashed_password: _hp, tokens: _tokens, ...user } = result.rows[0];
    return user as UserPublic;
  }

  const err = new Error('ONBOARDING_UPDATE_FAILED');
  (err as Error & { code: string }).code = 'ONBOARDING_UPDATE_FAILED';
  throw err;
};
