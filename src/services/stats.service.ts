import pool from '../db/pool';

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
