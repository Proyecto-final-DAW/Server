import bcrypt from 'bcryptjs';

import pool from '../db/pool';
import { UserPublic } from '../models/User';
import { calculateCalories } from './macros.service';

const SALT_ROUNDS = 10;

const ALLOWED_PROFILE_FIELDS: Record<string, string> = {
  name: 'name',
  weight: 'weight',
  height: 'height',
  age: 'age',
  activity_level: 'activity_level',
  goal: 'goal',
  sleep_hours: 'sleep_hours',
};

const MACRO_TRIGGER_FIELDS = [
  'weight',
  'height',
  'age',
  'activity_level',
  'goal',
];

const ACTIVITY_FACTOR_MAP: Record<string, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

const GOAL_TO_MACRO: Record<string, string> = {
  LOSE_FAT: 'LOSE',
  GAIN_MUSCLE: 'GAIN',
  MAINTAIN: 'MAINTAIN',
  HEALTH: 'MAINTAIN',
  LOSE: 'LOSE',
  GAIN: 'GAIN',
};

function throwCoded(message: string, code: string): never {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  throw err;
}

export async function getProfileSummary(userId: number) {
  const [userResult, statsResult, sessionsResult] = await Promise.all([
    pool.query('SELECT * FROM users WHERE id = $1', [userId]),
    pool.query('SELECT streak, best_streak FROM stats WHERE user_id = $1', [
      userId,
    ]),
    pool.query(
      'SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1',
      [userId]
    ),
  ]);

  if (!userResult.rows[0]) {
    throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
  }

  const { hashed_password: _, tokens: __, ...user } = userResult.rows[0];
  const stats = statsResult.rows[0] ?? { streak: 0, best_streak: 0 };
  const totalSessions = sessionsResult.rows[0]?.total ?? 0;

  return {
    ...user,
    streak: stats.streak,
    best_streak: stats.best_streak,
    total_sessions: totalSessions,
  };
}

export async function updateProfile(
  userId: number,
  data: Record<string, unknown>
): Promise<UserPublic> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_PROFILE_FIELDS[key] && value !== undefined) {
      fields.push(ALLOWED_PROFILE_FIELDS[key]);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    throwCoded('NO_FIELDS_TO_UPDATE', 'NO_FIELDS_TO_UPDATE');
  }

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
  const idPlaceholder = fields.length + 1;

  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${idPlaceholder} RETURNING *`,
    [...values, userId]
  );

  if (!result.rows[0]) {
    throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
  }

  const updatedUser = result.rows[0];

  const needsRecalc = fields.some((f) => MACRO_TRIGGER_FIELDS.includes(f));
  if (needsRecalc && canRecalcMacros(updatedUser)) {
    const activityFactor = ACTIVITY_FACTOR_MAP[updatedUser.activity_level];
    const macroGoal = GOAL_TO_MACRO[updatedUser.goal];

    if (!activityFactor || !macroGoal) {
      const { hashed_password: _, tokens: __, ...publicUser } = updatedUser;
      return publicUser as UserPublic;
    }

    const macros = calculateCalories(
      updatedUser.weight,
      updatedUser.height,
      updatedUser.age,
      updatedUser.sex,
      activityFactor,
      macroGoal as 'LOSE' | 'GAIN' | 'MAINTAIN'
    );

    const macroResult = await pool.query(
      `UPDATE users SET daily_calories = $1, protein_grams = $2, fat_grams = $3, carb_grams = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        macros.daily_calories,
        macros.protein_grams,
        macros.fat_grams,
        macros.carb_grams,
        userId,
      ]
    );

    const {
      hashed_password: _,
      tokens: __,
      ...publicUser
    } = macroResult.rows[0];
    return publicUser as UserPublic;
  }

  const { hashed_password: _, tokens: __, ...publicUser } = updatedUser;
  return publicUser as UserPublic;
}

function canRecalcMacros(user: Record<string, unknown>): boolean {
  return Boolean(
    user.weight &&
    user.height &&
    user.age &&
    user.sex &&
    user.activity_level &&
    user.goal
  );
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const result = await pool.query(
    'SELECT hashed_password FROM users WHERE id = $1',
    [userId]
  );

  if (!result.rows[0]) {
    throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
  }

  const isValid = await bcrypt.compare(
    currentPassword,
    result.rows[0].hashed_password
  );
  if (!isValid) {
    throwCoded('INVALID_PASSWORD', 'INVALID_PASSWORD');
  }

  if (newPassword.length < 6) {
    throwCoded('PASSWORD_TOO_SHORT', 'PASSWORD_TOO_SHORT');
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await pool.query(
    `UPDATE users SET hashed_password = $1, tokens = ARRAY[]::text[], updated_at = NOW() WHERE id = $2`,
    [hashedPassword, userId]
  );
}
