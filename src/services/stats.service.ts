import pool from '../db/pool';
import { calculateStreak } from './streak.service';

export const createStats = async (userId: number) => {
  const result = await pool.query(
    'INSERT INTO stats (user_id) VALUES ($1) RETURNING *',
    [userId]
  );
  return result.rows[0];
};

export const findByUserId = async (userId: number) => {
  const result = await pool.query('SELECT * FROM stats WHERE user_id = $1', [
    userId,
  ]);
  return result.rows[0];
};

export const updateStats = async (
  userId: number,
  data: Record<string, unknown>
) => {
  const fields = Object.keys(data);
  const values = Object.values(data);

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE stats SET ${setClause}, updated_at = NOW() WHERE user_id = $${fields.length + 1} RETURNING *`,
    [...values, userId]
  );
  return result.rows[0];
};

export const existsForUser = async (userId: number): Promise<boolean> => {
  const result = await pool.query('SELECT 1 FROM stats WHERE user_id = $1', [
    userId,
  ]);
  return result.rows.length > 0;
};

/**
 * Registers a workout session and atomically updates the streak.
 * Uses SELECT ... FOR UPDATE to lock the row and prevent race conditions.
 */
export const registerSession = async (userId: number, sessionDate?: Date) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM stats WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = rows[0];
    const result = calculateStreak(
      {
        streak: current.streak,
        best_streak: current.best_streak,
        last_session_date: current.last_session_date,
      },
      sessionDate ?? new Date()
    );

    if (!result.changed) {
      await client.query('COMMIT');
      return { stats: current, changed: false };
    }

    const updated = await client.query(
      `UPDATE stats
         SET streak = $1,
             best_streak = $2,
             last_session_date = $3,
             updated_at = NOW()
       WHERE user_id = $4
       RETURNING *`,
      [result.streak, result.best_streak, result.last_session_date, userId]
    );

    await client.query('COMMIT');
    return { stats: updated.rows[0], changed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
