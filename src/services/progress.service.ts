import pool from '../db/pool';

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface ExerciseMaxEntry {
  date: string;
  max_weight: number;
  reps: number;
}

export interface PerformedExerciseEntry {
  id: string;
  name: string;
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
 * Returns, per training day, the heaviest set logged for a given exercise.
 * Reads from the normalized session tables (sessions ⨝ session_exercises ⨝ exercise_sets).
 * `sessions.date` is a DATE column already in the user's local day, so no timezone math is needed.
 */
export const getExerciseMaxHistory = async (
  userId: number,
  exerciseId: string
): Promise<ExerciseMaxEntry[]> => {
  const result = await pool.query(
    `WITH ranked AS (
       SELECT s.date,
              es.weight::float AS weight,
              es.reps,
              ROW_NUMBER() OVER (
                PARTITION BY s.date
                ORDER BY es.weight DESC, es.reps DESC
              ) AS rn
         FROM sessions s
         JOIN session_exercises se ON se.session_id = s.id
         JOIN exercise_sets es ON es.session_exercise_id = se.id
        WHERE s.user_id = $1
          AND se.exercise_api_id = $2
     )
     SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date,
            weight AS max_weight,
            reps
       FROM ranked
      WHERE rn = 1
      ORDER BY date ASC`,
    [userId, exerciseId]
  );
  return result.rows;
};

/**
 * Returns the distinct exercises the user has logged at least once,
 * ordered by most recently performed first.
 */
export const getPerformedExercises = async (
  userId: number
): Promise<PerformedExerciseEntry[]> => {
  const result = await pool.query(
    `SELECT id, name
       FROM (
         SELECT DISTINCT ON (se.exercise_api_id)
                se.exercise_api_id AS id,
                se.name,
                s.date AS last_date
           FROM session_exercises se
           JOIN sessions s ON s.id = se.session_id
          WHERE s.user_id = $1
          ORDER BY se.exercise_api_id, s.date DESC, s.id DESC
       ) latest
      ORDER BY last_date DESC, id ASC`,
    [userId]
  );
  return result.rows;
};
