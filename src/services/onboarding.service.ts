import pool from '../db/pool';
import { OnboardingFormData } from '../models/Onboarding';
import { UserPublic } from '../models/User';

/** Maps onboarding request fields to `users` columns (single source of truth). */
function applyFormToUserUpdates(
  formData: OnboardingFormData,
  fields: string[],
  values: unknown[]
): void {
  (Object.entries(formData) as [keyof OnboardingFormData, unknown][]).forEach(
    ([key, raw]) => {
      if (raw === undefined || raw === '') {
        return;
      }

      switch (key) {
        case 'name': {
          const trimmed = String(raw).trim();
          if (trimmed) {
            fields.push('name');
            values.push(trimmed);
          }
          break;
        }
        case 'birthDate': {
          const date = new Date(String(raw));
          if (!Number.isNaN(date.getTime())) {
            fields.push('birth_date');
            values.push(date);
          }
          break;
        }
        case 'weight': {
          const n = Number(raw);
          if (!Number.isNaN(n)) {
            fields.push('weight');
            values.push(n);
          }
          break;
        }
        case 'height': {
          const n = Number(raw);
          if (!Number.isNaN(n)) {
            fields.push('height');
            values.push(n);
          }
          break;
        }
        case 'sex':
          fields.push('sex');
          values.push(raw);
          break;
        case 'activityLevel':
          fields.push('activity_level');
          values.push(raw);
          break;
        case 'goal':
          fields.push('goal');
          values.push(raw);
          break;
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

  const fields: string[] = ['onboarding_completed'];
  const values: unknown[] = [true];

  applyFormToUserUpdates(formData, fields, values);

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
  const idPlaceholder = fields.length + 1;

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
