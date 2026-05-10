import type { Goal, Sex } from '@prisma/client';
import jwt from 'jsonwebtoken';

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

/** Columns whose pg type is `numeric`/`decimal`. node-pg serialises
 *  these as JS strings (preserving precision); the rest of the
 *  codebase expects numbers, and a string-vs-number compare like
 *  `Number(form.weight) !== profile.weight` is silently always true,
 *  which made every profile save retransmit weight/height (and
 *  trigger an unnecessary macro recompute downstream). */
const NUMERIC_USER_FIELDS = ['weight', 'height'] as const;

function coerceNumericField(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
  for (const field of NUMERIC_USER_FIELDS) {
    if (field in out) {
      (out as Record<string, unknown>)[field] = coerceNumericField(out[field]);
    }
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

/**
 * Maximum tokens kept per user. Each successful login appends a JWT;
 * without a cap the column grows unbounded (one row per logged-in
 * device that never explicitly logged out / refreshed). 10 covers
 * "phone + tablet + desktop + a few stale browsers" comfortably.
 */
const MAX_TOKENS_PER_USER = 10;

export const addToken = async (userId: number, token: string) => {
  // Read-modify-write the `tokens` array atomically under a row lock.
  // Without this, two parallel logins from the same user (phone +
  // tablet within ~1s) both read the same `previous` array, both push
  // their own token, and the second writer silently drops the first
  // device's token — symptom from the user is "I logged in but it
  // keeps logging me out." `SELECT … FOR UPDATE` serialises the two
  // calls so each sees the other's append.
  const jwtSecret = process.env.JWT_SECRET as string;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ tokens: string[] | null }>(
      'SELECT tokens FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const previous = current.rows[0]?.tokens ?? [];
    const valid = previous.filter((t) => {
      try {
        // Same HS256 allowlist as the auth middleware — keeps the prune
        // step honest even if jsonwebtoken's defaults ever change.
        jwt.verify(t, jwtSecret, { algorithms: ['HS256'] });
        return true;
      } catch {
        return false;
      }
    });
    const next = [...valid, token].slice(-MAX_TOKENS_PER_USER);

    const result = await client.query(
      'UPDATE users SET tokens = $1::text[] WHERE id = $2 RETURNING tokens',
      [next, userId]
    );
    await client.query('COMMIT');
    return result.rows[0]?.tokens || [];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Hard-delete the user. FK cascades on sessions / routines / stats /
 * weight_logs / user_class_state / user_milestones do the cleanup
 * automatically; audit_logs SET NULL on actor/target so the security
 * trail survives the GDPR request.
 */
export const deleteUser = async (userId: number): Promise<void> => {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
};

export const removeToken = async (
  userId: number,
  token: string
): Promise<{ id: number } | null> => {
  // Only the existence of an updated row is needed (logout uses it as
  // a truthiness check). Returning `*` shipped the entire user row
  // back through the controller; trimming to `id` cuts the wire size.
  const result = await pool.query<{ id: number }>(
    'UPDATE users SET tokens = array_remove(tokens, $1) WHERE id = $2 RETURNING id',
    [token, userId]
  );
  return result.rows[0] ?? null;
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
