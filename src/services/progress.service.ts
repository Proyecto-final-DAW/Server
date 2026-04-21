import pool from '../db/pool';

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface ExerciseMaxEntry {
  date: string;
  max_weight: number;
}

export interface WeightHistoryOptions {
  limit: number;
  before?: Date;
}

/**
 * Returns weight history sorted chronologically (ascending).
 * `before` (optional) excludes entries on/after that date — useful for cursor paging.
 */
export const getWeightHistory = async (
  userId: number,
  options: WeightHistoryOptions
): Promise<WeightEntry[]> => {
  const params: unknown[] = [userId];
  let whereBefore = '';
  if (options.before) {
    params.push(options.before.toISOString().split('T')[0]);
    whereBefore = ` AND date < $${params.length}`;
  }
  params.push(options.limit);

  const result = await pool.query(
    `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, weight::float AS weight
       FROM weight_logs
      WHERE user_id = $1${whereBefore}
      ORDER BY date ASC, created_at ASC
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
};

/**
 * Registers a new weight entry and keeps `users.weight` in sync
 * so macro recalculations stay coherent. Runs in a transaction.
 */
export const registerWeight = async (
  userId: number,
  weight: number,
  date: Date
): Promise<WeightEntry> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isoDate = date.toISOString().split('T')[0];

    const inserted = await client.query(
      `INSERT INTO weight_logs (user_id, weight, date)
       VALUES ($1, $2, $3)
       RETURNING TO_CHAR(date, 'YYYY-MM-DD') AS date, weight::float AS weight`,
      [userId, weight, isoDate]
    );

    await client.query(
      `UPDATE users SET weight = $1, updated_at = NOW() WHERE id = $2`,
      [weight, userId]
    );

    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Returns the maximum weight lifted for a given exercise, grouped by local day.
 * `timezone` is an IANA name (e.g. 'Europe/Madrid'); defaults to UTC.
 * Sessions' `created_at` is stored as UTC timestamp without tz, so we
 * stamp it as UTC before converting.
 */
export const getExerciseMaxHistory = async (
  userId: number,
  exerciseId: string,
  timezone = 'UTC'
): Promise<ExerciseMaxEntry[]> => {
  const result = await pool.query(
    `SELECT TO_CHAR(
              (s.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3)::date,
              'YYYY-MM-DD'
            ) AS date,
            MAX((elem->>'weight')::numeric)::float AS max_weight
       FROM sessions s, jsonb_array_elements(s.exercises::jsonb) AS elem
      WHERE s.user_id = $1
        AND elem->>'exerciseId' = $2
      GROUP BY (s.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3)::date
      ORDER BY (s.created_at AT TIME ZONE 'UTC' AT TIME ZONE $3)::date ASC`,
    [userId, exerciseId, timezone]
  );
  return result.rows;
};
