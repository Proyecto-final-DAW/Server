import type { Goal, Sex } from '@prisma/client';

import pool from '../db/pool';
import { calculateCalories } from './macros.service';

/** `pg` returns enum arrays (e.g. `Goal[]`) as strings like `{LOSE_FAT}`. */
function parsePgEnumArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return [];
  }
  const inner = trimmed.slice(1, -1);
  if (!inner) {
    return [];
  }
  return inner.split(',').map((part) => {
    const p = part.trim();
    if (p.startsWith('"') && p.endsWith('"')) {
      return p.slice(1, -1).replace(/""/g, '"');
    }
    return p;
  });
}

export function normalizeUserRow<T extends Record<string, unknown> | undefined>(
  row: T
): T {
  if (!row) {
    return row;
  }
  const out = { ...row };
  if ('goals' in out) {
    (out as Record<string, unknown>).goals = parsePgEnumArray(out.goals);
  }
  if ('injuries' in out) {
    (out as Record<string, unknown>).injuries = parsePgEnumArray(out.injuries);
  }
  return out;
}

export const createUser = async (
  name: string,
  email: string,
  passwordHash: string
) => {
  const result = await pool.query(
    'INSERT INTO users (name, email, hashed_password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at, updated_at',
    [name, email, passwordHash]
  );
  return result.rows[0];
};

export const findByEmail = async (email: string) => {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    email,
  ]);
  return normalizeUserRow(result.rows[0]);
};

export const findById = async (id: number) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return normalizeUserRow(result.rows[0]);
};

export const updateUser = async (id: number, data: Record<string, unknown>) => {
  const fields = Object.keys(data);
  const values = Object.values(data);

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE users SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  return normalizeUserRow(result.rows[0]);
};

export interface NutritionProfileInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityFactor: number;
  goal: Goal;
}

/** Persists `daily_calories`, `protein_grams`, `fat_grams`, and `carb_grams` from profile inputs. */
export const updateUserMacroTargets = async (
  userId: number,
  input: NutritionProfileInput
) => {
  const macros = calculateCalories(
    input.weightKg,
    input.heightCm,
    input.age,
    input.sex,
    input.activityFactor,
    input.goal
  );
  return updateUser(userId, {
    daily_calories: macros.daily_calories,
    protein_grams: macros.protein_grams,
    fat_grams: macros.fat_grams,
    carb_grams: macros.carb_grams,
  });
};

export const addToken = async (userId: number, token: string) => {
  const result = await pool.query(
    'UPDATE users SET tokens = array_append(tokens, $1) WHERE id = $2 RETURNING tokens',
    [token, userId]
  );
  return result.rows[0]?.tokens || [];
};

export const removeToken = async (userId: number, token: string) => {
  const result = await pool.query(
    'UPDATE users SET tokens = array_remove(tokens, $1) WHERE id = $2 RETURNING *',
    [token, userId]
  );
  return normalizeUserRow(result.rows[0]);
};

export const hasToken = async (
  userId: number,
  token: string
): Promise<boolean> => {
  const result = await pool.query('SELECT tokens FROM users WHERE id = $1', [
    userId,
  ]);
  const tokens = result.rows[0]?.tokens || [];
  return Array.isArray(tokens) && tokens.includes(token);
};
