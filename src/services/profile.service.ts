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
  equipment: { column: 'equipment', cast: '"Equipment"[]' },
  days_per_week: { column: 'days_per_week' },
  injuries: { column: 'injuries', cast: '"Injury"[]' },
  injury_notes: { column: 'injury_notes' },
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

// Explicit column list for the user payload the profile screen needs.
// Skips `hashed_password` and `tokens` so they never leave the DB
// (the previous `SELECT *` then JS-strip pattern paid the
// serialization cost on every render and risked accidental leak if a
// future caller dropped the strip).
const PROFILE_USER_COLUMNS = [
  'id',
  'name',
  'email',
  'birth_date',
  'sex',
  'weight',
  'height',
  'age',
  'activity_level',
  'experience_level',
  'goals',
  'equipment',
  'days_per_week',
  'injuries',
  'injury_notes',
  'sleep_hours',
  'daily_calories',
  'protein_grams',
  'fat_grams',
  'carb_grams',
  'onboarding_completed',
  'created_at',
  'updated_at',
].join(', ');

export async function getProfileSummary(userId: number) {
  const [userResult, statsResult, sessionsResult] = await Promise.all([
    pool.query(`SELECT ${PROFILE_USER_COLUMNS} FROM users WHERE id = $1`, [
      userId,
    ]),
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

  // Single transaction so the metadata UPDATE and the derived-macros
  // UPDATE either both commit or both roll back. The earlier two-call
  // version could leave a user with the new weight saved but stale
  // macros if the calc threw — exactly the inconsistency the
  // onboarding fix was meant to prevent.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${idPlaceholder} RETURNING *`,
      [...values, userId]
    );

    if (!result.rows[0]) {
      throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
    }

    const updatedUser = normalizeUserRow(
      result.rows[0] as Record<string, unknown>
    );

    // Mirror the weight change into `weight_logs` so the progress
    // chart picks it up. Without this, editing the weight from the
    // profile silently updated `users.weight` and recalculated macros,
    // but the body-weight chart (which reads exclusively from
    // weight_logs) kept showing the old value until the user manually
    // registered a weight from /progress. No UNIQUE (user_id, date)
    // constraint exists on weight_logs — only an index — so we can't
    // use ON CONFLICT. Insert-if-missing + update-otherwise is safe
    // here because we're already inside the surrounding profile
    // transaction.
    if (updatedColumns.includes('weight')) {
      const rawWeight = updatedUser.weight as unknown;
      const weightValue =
        typeof rawWeight === 'number' ? rawWeight : Number(rawWeight);
      if (Number.isFinite(weightValue) && weightValue > 0) {
        const inserted = await client.query(
          `INSERT INTO weight_logs (user_id, weight, date)
           SELECT $1, $2, CURRENT_DATE
           WHERE NOT EXISTS (
             SELECT 1 FROM weight_logs
              WHERE user_id = $1 AND date = CURRENT_DATE
           )`,
          [userId, weightValue]
        );
        if (inserted.rowCount === 0) {
          await client.query(
            `UPDATE weight_logs SET weight = $2
              WHERE user_id = $1 AND date = CURRENT_DATE`,
            [userId, weightValue]
          );
        }
      }
    }

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

      const macroResult = await client.query(
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

      await client.query('COMMIT');
      const macroRow = normalizeUserRow(
        macroResult.rows[0] as Record<string, unknown>
      );
      const { hashed_password: _, tokens: __, ...publicUser } = macroRow;
      return publicUser as UserPublic;
    }

    await client.query('COMMIT');
    const { hashed_password: _, tokens: __, ...publicUser } = updatedUser;
    return publicUser as UserPublic;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
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

  // Aligned with `validators/auth.ts` register schema: a user must not
  // be able to set a weaker password via change-password than they
  // could during signup.
  if (newPassword.length < 8) {
    throwCoded('PASSWORD_TOO_SHORT', 'PASSWORD_TOO_SHORT');
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await pool.query(
    `UPDATE users SET hashed_password = $1, tokens = ARRAY[]::text[], updated_at = NOW() WHERE id = $2`,
    [hashedPassword, userId]
  );
}
