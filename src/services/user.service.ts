import pool from '../db/pool';

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
  return result.rows[0];
};

export const findById = async (id: number) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

export const updateUser = async (id: number, data: Record<string, unknown>) => {
  const fields = Object.keys(data);
  const values = Object.values(data);

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE users SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
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
  return result.rows[0];
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
