import bcrypt from 'bcryptjs';

import pool from '../db/pool';
import { UserPublic } from '../models/User';
import { resolveMacroInputs } from '../utils/macroProfile';
import { calculateCalories } from './macros.service';
import { normalizeUserRow } from './user.service';

const SALT_ROUNDS = 10;

type FieldSpec = { column: string; cast?: string };

const ALLOWED_PROFILE_FIELDS: Record<string, FieldSpec> = {
  name: { column: 'name' },
  weight: { column: 'weight' },
  height: { column: 'height' },
  age: { column: 'age' },
  activity_level: { column: 'activity_level' },
  goals: { column: 'goals', cast: '"Goal"[]' },
  sleep_hours: { column: 'sleep_hours' },
  sex: { column: 'sex', cast: '"Sex"' },
  experience_level: { column: 'experience_level', cast: '"ExperienceLevel"' },
  equipment: { column: 'equipment', cast: '"Equipment"' },
  days_per_week: { column: 'days_per_week' },
  injuries: { column: 'injuries', cast: '"Injury"[]' },
};

const MACRO_TRIGGER_FIELDS = [
  'weight',
  'height',
  'age',
  'sex',
  'activity_level',
  'goals',
];

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

  const row = normalizeUserRow(userResult.rows[0] as Record<string, unknown>);
  const { hashed_password: _, tokens: __, ...user } = row;
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
  const setParts: string[] = [];
  const values: unknown[] = [];
  const updatedColumns: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const spec = ALLOWED_PROFILE_FIELDS[key];
    if (spec && value !== undefined) {
      values.push(value);
      const ph = `$${values.length}`;
      setParts.push(
        `${spec.column} = ${spec.cast ? `${ph}::${spec.cast}` : ph}`
      );
      updatedColumns.push(spec.column);
    }
  }

  if (setParts.length === 0) {
    throwCoded('NO_FIELDS_TO_UPDATE', 'NO_FIELDS_TO_UPDATE');
  }

  const setClause = setParts.join(', ');
  const idPlaceholder = values.length + 1;

  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${idPlaceholder} RETURNING *`,
    [...values, userId]
  );

  if (!result.rows[0]) {
    throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
  }

  const updatedUser = normalizeUserRow(
    result.rows[0] as Record<string, unknown>
  );

  const needsRecalc = updatedColumns.some((f) =>
    MACRO_TRIGGER_FIELDS.includes(f)
  );
  const inputs = needsRecalc ? resolveMacroInputs(updatedUser) : null;
  if (inputs) {
    const macros = calculateCalories(
      inputs.weightKg,
      inputs.heightCm,
      inputs.age,
      inputs.sex,
      inputs.activityFactor,
      inputs.goal
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

    const macroRow = normalizeUserRow(
      macroResult.rows[0] as Record<string, unknown>
    );
    const { hashed_password: _, tokens: __, ...publicUser } = macroRow;
    return publicUser as UserPublic;
  }

  const { hashed_password: _, tokens: __, ...publicUser } = updatedUser;
  return publicUser as UserPublic;
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
