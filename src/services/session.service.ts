import pool from '../db/pool';
import type { UnlockedMilestone } from '../models/Milestone';
import { ExerciseType } from '../models/SessionExercise';
import * as milestoneService from './milestone.service';
import { applyGains, calculateGains } from './progression.service';
import * as statsService from './stats.service';

type SessionSetInput = {
  set_number: number;
  reps: number;
  weight: number;
};

export type SessionExerciseInput = {
  exercise_name: string;
  exercise_api_id?: string | null;
  muscle_group: string;
  type: ExerciseType;
  sets: SessionSetInput[];
};

type SessionInput = {
  userId: number;
  routineId?: number | null;
  date: Date;
  notes?: string | null;
  exercises: SessionExerciseInput[];
};

const countUserSessions = async (userId: number): Promise<number> => {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].total;
};

const getTotalWeightLifted = async (userId: number): Promise<number> => {
  const result = await pool.query(
    `SELECT COALESCE(SUM((ss.weight * ss.reps),0) AS total
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

export const createSession = async ({
  userId,
  routineId = null,
  date,
  notes = null,
  exercises,
}: SessionInput) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `
        INSERT INTO sessions (user_id, routine_id, date, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [userId, routineId, date, notes]
    );

    const session = sessionResult.rows[0];

    for (const exercise of exercises) {
      const sessionExerciseResult = await client.query(
        `
          INSERT INTO session_exercises (
            session_id,
            exercise_name,
            exercise_api_id,
            muscle_group
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [
          session.id,
          exercise.exercise_name,
          exercise.exercise_api_id ?? null,
          exercise.muscle_group,
        ]
      );

      const sessionExercise = sessionExerciseResult.rows[0];

      for (const set of exercise.sets) {
        await client.query(
          `
            INSERT INTO session_sets (
              session_exercise_id,
              set_number,
              reps,
              weight
            )
            VALUES ($1, $2, $3, $4)
          `,
          [sessionExercise.id, set.set_number, set.reps, set.weight]
        );
      }
    }

    await client.query('COMMIT');
    return session;
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
}: SessionInput) => {
  const currentStats = await statsService.findByUserId(userId);
  if (!currentStats) {
    const error = new Error('Stats not initialized');
    (error as Error & { code: string }).code = 'STATS_NOT_FOUND';
    throw error;
  }

  const session = await createSession({
    userId,
    routineId,
    date,
    notes,
    exercises,
  });

  const gains = calculateGains(exercises);
  const statUpdates = applyGains(currentStats, gains);

  // Update streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = currentStats.last_session_date
    ? new Date(currentStats.last_session_date)
    : null;
  if (lastDate) lastDate.setHours(0, 0, 0, 0);

  const diffDays = lastDate
    ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
    : -1;

  let streak = currentStats.streak;
  if (diffDays === 1) {
    streak += 1;
  } else if (diffDays !== 0) {
    streak = 1;
  }

  const bestStreak = Math.max(currentStats.best_streak, streak);

  // Tenacity gains from session consistency
  const tenacityXp = currentStats.tenacity + 5;
  let tenacityLevel = currentStats.tenacity_level;
  let tenacityFinal = tenacityXp;
  while (tenacityFinal >= 100) {
    tenacityFinal -= 100;
    tenacityLevel += 1;
  }

  const updatedStats = await statsService.updateStats(userId, {
    ...statUpdates,
    tenacity: tenacityFinal,
    tenacity_level: tenacityLevel,
    streak,
    best_streak: bestStreak,
    last_session_date: today.toISOString().split('T')[0],
  });

  // Check milestones — secondary, must not block the session
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
      milestoneService.checkAndUnlock(userId, 'TOTAL_SESSIONS', totalSessions),
      milestoneService.checkAndUnlock(userId, 'STREAK', streak),
      milestoneService.checkAndUnlock(userId, 'STAT_LEVEL', maxStatLevel),
      milestoneService.checkAndUnlock(userId, 'TOTAL_WEIGHT', totalWeight),
    ]);

    newMilestones = milestoneChecks.flat();
  } catch {
    // Milestone check failed — session and stats are already saved
  }

  return { session, stats: updatedStats, newMilestones };
};
