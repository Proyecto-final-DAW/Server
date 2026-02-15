import pool from "../db/pool";

export const createUser = async (email: string, passwordHash: string) => {
   const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, passwordHash]
   );
   return result.rows[0];
};

export const findByEmail = async (email: string) => {
   const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
   );
   return result.rows[0];
};

export const findById = async (id: number) => {
   const result = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
   );
   return result.rows[0];
};

export const updateUser = async (id: number, data: Record<string, any>) => {
   const fields = Object.keys(data);
   const values = Object.values(data);

   const setClause = fields
      .map((field, i) => `${field} = $${i + 1}`)
      .join(", ");

   const result = await pool.query(
      `UPDATE users SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
   );
   return result.rows[0];
};