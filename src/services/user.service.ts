import type { Goal, Sex } from '@prisma/client';

import pool from '../db/pool';
import { calculateCalories } from './macros.service';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
  if ('equipment' in out) {
    (out as Record<string, unknown>).equipment = parsePgEnumArray(
      out.equipment
    );
  }
  return out;
}

export const createUser = async (
  name: string,
  email: string,
  passwordHash: string
) => {
  const normalizedEmail = normalizeEmail(email);
  const result = await pool.query(
    'INSERT INTO users (name, email, hashed_password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at, updated_at',
    [name, normalizedEmail, passwordHash]
  );
  return result.rows[0];
};

export const findByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    normalizedEmail,
  ]);
  return normalizeUserRow(result.rows[0]);
};

export const findById = async (id: number) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
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

/**
 * Persists `daily_calories`, `protein_grams`, `fat_grams`, and `carb_grams`
 * from profile inputs. SQL is hardcoded (no dynamic column interpolation)
 * — general profile mutations live in `profile.service.updateProfile`,
 * which has its own column allowlist.
 */
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
  const result = await pool.query(
    `UPDATE users
        SET daily_calories = $1,
            protein_grams  = $2,
            fat_grams      = $3,
            carb_grams     = $4,
            updated_at     = NOW()
      WHERE id = $5
      RETURNING *`,
    [
      macros.daily_calories,
      macros.protein_grams,
      macros.fat_grams,
      macros.carb_grams,
      userId,
    ]
  );
  return normalizeUserRow(result.rows[0]);
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
