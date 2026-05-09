import pool from '../db/pool';
import type { RoutineExercise } from '../models/Routine';
import { getExerciseMetaById } from './exercise.service';

/**
 * Pulls `category` and `equipment` out of the bundled catalog and
 * stamps them onto the routine_exercises row. The columns aren't
 * persisted (the catalog is the source of truth and would drift
 * silently if duplicated), so the join happens here at read time.
 */
const hydrateRoutineExercise = (row: RoutineExercise): RoutineExercise => {
  const meta = getExerciseMetaById(row.exercise_api_id);
  return { ...row, category: meta.category, equipment: meta.equipment };
};

export interface CreateRoutineInput {
  name: string;
  description?: string;
  exercises: Omit<RoutineExercise, 'id' | 'routine_id'>[];
}

export interface UpdateRoutineInput {
  name?: string;
  description?: string | null;
  exercises?: Omit<RoutineExercise, 'id' | 'routine_id'>[];
}

const getAllExercisesByRoutineIds = async (routineIds: number[]) => {
  if (routineIds.length === 0) return new Map<number, RoutineExercise[]>();

  const result = await pool.query(
    `SELECT id, routine_id, exercise_api_id, exercise_name, sets, reps, order_index
     FROM routine_exercises
     WHERE routine_id = ANY($1::int[])
     ORDER BY routine_id ASC, order_index ASC NULLS LAST, id ASC`,
    [routineIds]
  );

  const map = new Map<number, RoutineExercise[]>();
  for (const row of result.rows as RoutineExercise[]) {
    const arr = map.get(row.routine_id) ?? [];
    arr.push(hydrateRoutineExercise(row));
    map.set(row.routine_id, arr);
  }
  return map;
};

export const getAllByUser = async (userId: number) => {
  const routinesResult = await pool.query(
    `SELECT id, user_id, name, description, created_at, updated_at
     FROM routines
     WHERE user_id = $1
     ORDER BY updated_at DESC, id DESC`,
    [userId]
  );

  const routines = routinesResult.rows as Array<{
    id: number;
    user_id: number;
    name: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  }>;

  const ids = routines.map((r) => r.id);
  const exercisesByRoutine = await getAllExercisesByRoutineIds(ids);

  return routines.map((r) => ({
    ...r,
    exercises: exercisesByRoutine.get(r.id) ?? [],
  }));
};

export const getById = async (userId: number, routineId: number) => {
  const routineResult = await pool.query(
    `SELECT id, user_id, name, description, created_at, updated_at
     FROM routines
     WHERE id = $1 AND user_id = $2`,
    [routineId, userId]
  );
  const routine = routineResult.rows[0] ?? null;
  if (!routine) return null;

  const exercisesResult = await pool.query(
    `SELECT id, routine_id, exercise_api_id, exercise_name, sets, reps, order_index
     FROM routine_exercises
     WHERE routine_id = $1
     ORDER BY order_index ASC NULLS LAST, id ASC`,
    [routineId]
  );

  return {
    ...routine,
    exercises: (exercisesResult.rows as RoutineExercise[]).map(
      hydrateRoutineExercise
    ),
  };
};

export const create = async (userId: number, input: CreateRoutineInput) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const routineResult = await client.query(
      `INSERT INTO routines (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, name, description, created_at, updated_at`,
      [userId, input.name, input.description ?? null]
    );

    const routine = routineResult.rows[0] as {
      id: number;
      user_id: number;
      name: string;
      description: string | null;
      created_at: Date;
      updated_at: Date;
    };

    const exercises = input.exercises ?? [];
    if (exercises.length > 0) {
      const values: unknown[] = [];
      const placeholders = exercises
        .map((e, i) => {
          const base = i * 6;
          values.push(
            routine.id,
            e.exercise_api_id,
            e.exercise_name ?? null,
            e.sets ?? null,
            e.reps ?? null,
            e.order_index ?? null
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
        })
        .join(', ');

      await client.query(
        `INSERT INTO routine_exercises
         (routine_id, exercise_api_id, exercise_name, sets, reps, order_index)
         VALUES ${placeholders}`,
        values
      );
    }

    await client.query('COMMIT');
    return await getById(userId, routine.id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const update = async (
  userId: number,
  routineId: number,
  input: UpdateRoutineInput
) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure ownership exists
    const exists = await client.query(
      `SELECT id FROM routines WHERE id = $1 AND user_id = $2`,
      [routineId, userId]
    );
    if (exists.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;

    const fields = Object.keys(data);
    const values = Object.values(data);

    if (fields.length > 0) {
      const setClause = fields
        .map((field, i) => `${field} = $${i + 1}`)
        .join(', ');

      await client.query(
        `UPDATE routines
         SET ${setClause}
         WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2}`,
        [...values, routineId, userId]
      );
    }

    if (input.exercises !== undefined) {
      await client.query(
        `DELETE FROM routine_exercises WHERE routine_id = $1`,
        [routineId]
      );

      const exercises = input.exercises ?? [];
      if (exercises.length > 0) {
        const exValues: unknown[] = [];
        const placeholders = exercises
          .map((e, i) => {
            const base = i * 6;
            exValues.push(
              routineId,
              e.exercise_api_id,
              e.exercise_name ?? null,
              e.sets ?? null,
              e.reps ?? null,
              e.order_index ?? null
            );
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
          })
          .join(', ');

        await client.query(
          `INSERT INTO routine_exercises
           (routine_id, exercise_api_id, exercise_name, sets, reps, order_index)
           VALUES ${placeholders}`,
          exValues
        );
      }
    }

    await client.query('COMMIT');
    return await getById(userId, routineId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const remove = async (userId: number, routineId: number) => {
  const result = await pool.query(
    `DELETE FROM routines WHERE id = $1 AND user_id = $2 RETURNING id`,
    [routineId, userId]
  );
  return result.rows[0] ?? null;
};
