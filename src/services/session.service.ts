import type { PoolClient } from 'pg';

import pool from '../db/pool';
import type { UnlockedMilestone } from '../models/Milestone';
import {
  CreateSessionData,
  SessionRow,
  SessionExerciseRow,
  SessionSetRow,
  CreatedSessionGraph,
} from '../models/SessionTypes';
import * as milestoneService from './milestone.service';
import { applyGains, calculateGains } from './progression.service';
import * as statsService from './stats.service';

const countUserSessions = async (userId: number): Promise<number> => {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1',
    [userId]
  );

  return result.rows[0].total;
};

const getTotalWeightLifted = async (userId: number): Promise<number> => {
  const result = await pool.query(
    `
      SELECT COALESCE(SUM(ss.weight * ss.reps), 0)::int AS total
      FROM sessions s
      INNER JOIN session_exercises se
        ON se.session_id = s.id
      INNER JOIN session_sets ss
        ON ss.session_exercise_id = se.id
      WHERE s.user_id = $1
    `,
    [userId]
  );

  return result.rows[0].total;
};

const createSessionTx = async (
  client: PoolClient,
  { userId, routineId = null, date, notes = null, exercises }: CreateSessionData
): Promise<CreatedSessionGraph> => {
  if (routineId !== null) {
    const routineResult = await client.query<{ id: number }>(
      `
        SELECT id
        FROM routines
        WHERE id = $1 AND user_id = $2
      `,
      [routineId, userId]
    );

    if (routineResult.rowCount === 0) {
      const error = new Error('Routine not found');
      (error as Error & { code: string }).code = 'ROUTINE_NOT_FOUND';
      throw error;
    }
  }

  const sessionResult = await client.query<SessionRow>(
    `
      INSERT INTO sessions (user_id, routine_id, date, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [userId, routineId, date, notes]
  );

  const session = sessionResult.rows[0];

  if (exercises.length === 0) {
    return {
      session,
      exercises: [],
    };
  }

  const exerciseValues: Array<number | string | null> = [];
  const exercisePlaceholders = exercises.map((exercise, index) => {
    const base = index * 5;

    exerciseValues.push(
      session.id,
      exercise.exercise_name,
      exercise.type,
      exercise.exercise_api_id ?? null,
      exercise.muscle_group
    );

    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const sessionExercisesResult = await client.query<SessionExerciseRow>(
    `
      INSERT INTO session_exercises (
        session_id,
        exercise_name,
        type,
        exercise_api_id,
        muscle_group
      )
      VALUES ${exercisePlaceholders.join(', ')}
      RETURNING *
    `,
    exerciseValues
  );

  const insertedExercises = sessionExercisesResult.rows;

  const setValues: Array<number | string> = [];
  const setPlaceholders: string[] = [];

  insertedExercises.forEach((insertedExercise, exerciseIndex) => {
    const originalExercise = exercises[exerciseIndex];

    originalExercise.sets.forEach((set) => {
      const base = setValues.length;

      setValues.push(insertedExercise.id, set.set_number, set.reps, set.weight);

      setPlaceholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
      );
    });
  });

  let insertedSets: SessionSetRow[] = [];

  if (setPlaceholders.length > 0) {
    const sessionSetsResult = await client.query<SessionSetRow>(
      `
        INSERT INTO session_sets (
          session_exercise_id,
          set_number,
          reps,
          weight
        )
        VALUES ${setPlaceholders.join(', ')}
        RETURNING *
      `,
      setValues
    );

    insertedSets = sessionSetsResult.rows;
  }

  const exercisesWithSets = insertedExercises.map((exercise) => ({
    ...exercise,
    sets: insertedSets.filter((set) => set.session_exercise_id === exercise.id),
  }));

  return {
    session,
    exercises: exercisesWithSets,
  };
};

export const createSession = async (input: CreateSessionData) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const created = await createSessionTx(client, input);

    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Processes a new training session:
 * 1. Saves the session to DB
 * 2. Calculates XP gains from exercises
 * 3. Applies gains to user stats (with level-up handling)
 * 4. Updates streak tracking
 */
export const processSession = async ({
  userId,
  routineId = null,
  date,
  notes = null,
  exercises,
}: CreateSessionData) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentStats = await statsService.findByUserId(userId, client);

    if (!currentStats) {
      const error = new Error('Stats not initialized');
      (error as Error & { code: string }).code = 'STATS_NOT_FOUND';
      throw error;
    }

    const created = await createSessionTx(client, {
      userId,
      routineId,
      date,
      notes,
      exercises,
    });

    const gains = calculateGains(exercises);
    const statUpdates = applyGains(currentStats, gains);

    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);

    const lastDate = currentStats.last_session_date
      ? new Date(currentStats.last_session_date)
      : null;

    if (lastDate) {
      lastDate.setHours(0, 0, 0, 0);
    }

    const diffDays = lastDate
      ? Math.floor(
          (sessionDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      : -1;

    let streak = currentStats.streak;

    if (diffDays === 1) {
      streak += 1;
    } else if (diffDays !== 0) {
      streak = 1;
    }

    const bestStreak = Math.max(currentStats.best_streak, streak);

    const tenacityXp = currentStats.tenacity + 5;
    let tenacityLevel = currentStats.tenacity_level;
    let tenacityFinal = tenacityXp;

    while (tenacityFinal >= 100) {
      tenacityFinal -= 100;
      tenacityLevel += 1;
    }

    const updatedStats = await statsService.updateStats(
      userId,
      {
        ...statUpdates,
        tenacity: tenacityFinal,
        tenacity_level: tenacityLevel,
        streak,
        best_streak: bestStreak,
        last_session_date: sessionDate.toISOString().split('T')[0],
      },
      client
    );

    await client.query('COMMIT');

    let newMilestones: UnlockedMilestone[] = [];

    try {
      const [totalSessions, totalWeight] = await Promise.all([
        countUserSessions(userId),
        getTotalWeightLifted(userId),
      ]);

      const statLevels = [
        updatedStats.strength_level,
        updatedStats.endurance_level,
        updatedStats.stamina_level,
        updatedStats.agility_level,
        updatedStats.tenacity_level,
        updatedStats.vigor_level,
      ];

      const maxStatLevel = Math.max(...statLevels);

      const milestoneChecks = await Promise.all([
        milestoneService.checkAndUnlock(
          userId,
          'TOTAL_SESSIONS',
          totalSessions
        ),
        milestoneService.checkAndUnlock(userId, 'STREAK', streak),
        milestoneService.checkAndUnlock(userId, 'STAT_LEVEL', maxStatLevel),
        milestoneService.checkAndUnlock(userId, 'TOTAL_WEIGHT', totalWeight),
      ]);

      newMilestones = milestoneChecks.flat();
    } catch {
      // Milestones are secondary and should not fail the request
    }

    return {
      session: {
        ...created.session,
        exercises: created.exercises,
      },
      stats: updatedStats,
      newMilestones,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
