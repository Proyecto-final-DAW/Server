import pool from '../db/pool';
import { OnboardingFormData } from '../models/Onboarding';
import { UserPublic } from '../models/User';

export const submitOnboarding = async (
  userId: number,
  formData: OnboardingFormData
): Promise<UserPublic | null> => {
  const fields: string[] = ['onboarding_completed'];
  const values: unknown[] = [true];

  (Object.entries(formData) as [keyof OnboardingFormData, string][]).forEach(
    ([key, rawValue]) => {
      if (!rawValue) {
        return;
      }

      switch (key) {
        case 'name': {
          const trimmed = rawValue.trim();
          if (trimmed) {
            fields.push('name');
            values.push(trimmed);
          }
          break;
        }
        case 'birthDate': {
          const date = new Date(rawValue);
          if (!Number.isNaN(date.getTime())) {
            fields.push('birth_date');
            values.push(date);
          }
          break;
        }
        case 'weight': {
          const weight = Number(rawValue);
          if (!Number.isNaN(weight)) {
            fields.push('weight');
            values.push(weight);
          }
          break;
        }
        case 'height': {
          const height = Number(rawValue);
          if (!Number.isNaN(height)) {
            fields.push('height');
            values.push(height);
          }
          break;
        }
        case 'sex': {
          fields.push('sex');
          values.push(rawValue);
          break;
        }
        case 'activityLevel': {
          fields.push('activity_level');
          values.push(rawValue);
          break;
        }
        case 'goal': {
          fields.push('goal');
          values.push(rawValue);
          break;
        }
        default:
          break;
      }
    }
  );

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${
      fields.length + 1
    } RETURNING *`,
    [...values, userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  const { hashed_password: _hp, tokens: _tokens, ...user } = result.rows[0];

  return user as UserPublic;
};
