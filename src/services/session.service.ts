import pool from '../db/pool';
import type { UnlockedMilestone } from '../models/Milestone';
import type {
  CreateSessionInput,
  ExerciseSet,
  Session,
  SessionExercise,
} from '../models/Session';
import { logger } from '../utils/logger';
import * as characterService from './character.service';
import * as milestoneService from './milestone.service';
import { applyGains, calculateGains } from './progression.service';
import * as statsService from './stats.service';

const toISODate = (date: Date | string): string => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
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
    `SELECT COALESCE(SUM(es.weight * es.reps), 0)::int AS total
     FROM exercise_sets es
     JOIN session_exercises se ON se.id = es.session_exercise_id
     JOIN sessions s ON s.id = se.session_id
     WHERE s.user_id = $1`,
    [userId]
  );
  return result.rows[0].total;
};

export interface WeeklyMetrics {
  daysTrained: number;
  totalExercises: number;
  totalVolume: number;
}

export interface WeeklySummary {
  current: WeeklyMetrics;
  previous: WeeklyMetrics;
}

const EMPTY_WEEK: WeeklyMetrics = {
  daysTrained: 0,
  totalExercises: 0,
  totalVolume: 0,
};

interface WeeklyMetricsRow {
  bucket: 'current' | 'previous';
  days_trained: number;
  total_exercises: number;
  total_volume: number;
}

/**
 * Returns metrics for the current ISO week and the previous one for the user.
 * - daysTrained: distinct training dates (`sessions.date`) within the week.
 * - totalExercises: number of `session_exercises` rows.
 * - totalVolume: sum of `reps * weight` across all `exercise_sets`.
 */
export const getWeeklySummary = async (
  userId: number
): Promise<WeeklySummary> => {
  const result = await pool.query<WeeklyMetricsRow>(
    `WITH bounds AS (
       SELECT
         date_trunc('week', CURRENT_DATE)::date AS current_start,
         (date_trunc('week', CURRENT_DATE) - INTERVAL '1 week')::date AS previous_start,
         (date_trunc('week', CURRENT_DATE) + INTERVAL '1 week')::date AS next_start
     ),
     session_metrics AS (
       SELECT
         s.id,
         s.date,
         (
           SELECT COUNT(*)
           FROM session_exercises se
           WHERE se.session_id = s.id
         ) AS exercise_count,
         (
           SELECT COALESCE(SUM(es.weight * es.reps), 0)
           FROM session_exercises se
           JOIN exercise_sets es ON es.session_exercise_id = se.id
           WHERE se.session_id = s.id
         ) AS volume
       FROM sessions s, bounds b
       WHERE s.user_id = $1
         AND s.date >= b.previous_start
         AND s.date < b.next_start
     )
     SELECT
       CASE
         WHEN sm.date >= b.current_start THEN 'current'
         ELSE 'previous'
       END AS bucket,
       COUNT(DISTINCT sm.date)::int AS days_trained,
       COALESCE(SUM(sm.exercise_count), 0)::int AS total_exercises,
       COALESCE(SUM(sm.volume), 0)::int AS total_volume
     FROM session_metrics sm, bounds b
     GROUP BY bucket`,
    [userId]
  );

  const summary: WeeklySummary = {
    current: { ...EMPTY_WEEK },
    previous: { ...EMPTY_WEEK },
  };

  for (const row of result.rows) {
    summary[row.bucket] = {
      daysTrained: row.days_trained,
      totalExercises: row.total_exercises,
      totalVolume: row.total_volume,
    };
  }

  return summary;
};

/**
 * Inserts a new session with all its nested exercises and sets inside a single
 * transaction. If any insert fails, the whole session is rolled back.
 */
export const createSession = async (
  userId: number,
  input: CreateSessionInput
): Promise<Session> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `INSERT INTO sessions (user_id, routine_id, date)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, input.routine_id ?? null, input.date]
    );
    const sessionId = sessionResult.rows[0].id as number;

    const seValues: unknown[] = [];
    const sePlaceholders = input.exercises
      .map((exercise, i) => {
        const base = i * 5;
        seValues.push(
          sessionId,
          exercise.exercise_api_id,
          exercise.name,
          exercise.type,
          i
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      })
      .join(', ');

    const seResult = await client.query(
      `INSERT INTO session_exercises (session_id, exercise_api_id, name, type, order_index)
       VALUES ${sePlaceholders}
       RETURNING id, order_index`,
      seValues
    );

    const seIdByOrder = new Map<number, number>();
    for (const row of seResult.rows as Array<{
      id: number;
      order_index: number;
    }>) {
      seIdByOrder.set(row.order_index, row.id);
    }

    const setValues: unknown[] = [];
    const setPlaceholders: string[] = [];
    let paramIdx = 0;
    input.exercises.forEach((exercise, exIdx) => {
      const sessionExerciseId = seIdByOrder.get(exIdx);
      if (sessionExerciseId === undefined) {
        throw new Error(`Missing session_exercise id for order ${exIdx}`);
      }
      exercise.sets.forEach((set, setIdx) => {
        setValues.push(sessionExerciseId, set.reps, set.weight, setIdx);
        setPlaceholders.push(
          `($${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
        );
        paramIdx += 4;
      });
    });

    if (setPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO exercise_sets (session_exercise_id, reps, weight, order_index)
         VALUES ${setPlaceholders.join(', ')}`,
        setValues
      );
    }

    await client.query('COMMIT');

    const created = await getSessionDetail(userId, sessionId);
    if (!created) {
      throw new Error('Failed to read back created session');
    }
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Returns a single session for the given user with exercises and sets fully
 * hydrated. Returns null if the session does not exist or belongs to another user.
 */
export const getSessionDetail = async (
  userId: number,
  sessionId: number
): Promise<Session | null> => {
  const sessionResult = await pool.query(
    `SELECT id, user_id, routine_id, date, created_at
     FROM sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const session = sessionResult.rows[0] as
    | {
        id: number;
        user_id: number;
        routine_id: number | null;
        date: Date;
        created_at: Date;
      }
    | undefined;
  if (!session) return null;

  const exercisesResult = await pool.query(
    `SELECT id, session_id, exercise_api_id, name, type, order_index
     FROM session_exercises
     WHERE session_id = $1
     ORDER BY order_index ASC, id ASC`,
    [sessionId]
  );
  const exerciseRows = exercisesResult.rows as Array<
    Omit<SessionExercise, 'sets'>
  >;

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setsByExercise = await getSetsForExercises(exerciseIds);

  const exercises: SessionExercise[] = exerciseRows.map((e) => ({
    ...e,
    sets: setsByExercise.get(e.id) ?? [],
  }));

  return {
    id: session.id,
    user_id: session.user_id,
    routine_id: session.routine_id,
    date: toISODate(session.date),
    created_at: session.created_at,
    exercises,
  };
};

interface PaginatedSessions {
  sessions: Session[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Returns the user's sessions ordered by date DESC (most recent first),
 * with pagination. Each session includes its exercises and sets.
 */
export const getUserSessions = async (
  userId: number,
  opts: { page?: number; limit?: number } = {}
): Promise<PaginatedSessions> => {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1`,
    [userId]
  );
  const total = countResult.rows[0].total as number;

  const sessionsResult = await pool.query(
    `SELECT id, user_id, routine_id, date, created_at
     FROM sessions
     WHERE user_id = $1
     ORDER BY date DESC, created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const sessionRows = sessionsResult.rows as Array<{
    id: number;
    user_id: number;
    routine_id: number | null;
    date: Date;
    created_at: Date;
  }>;

  if (sessionRows.length === 0) {
    return { sessions: [], total, page, limit };
  }

  const sessionIds = sessionRows.map((s) => s.id);

  const exercisesResult = await pool.query(
    `SELECT id, session_id, exercise_api_id, name, type, order_index
     FROM session_exercises
     WHERE session_id = ANY($1::int[])
     ORDER BY session_id ASC, order_index ASC, id ASC`,
    [sessionIds]
  );
  const exerciseRows = exercisesResult.rows as Array<
    Omit<SessionExercise, 'sets'>
  >;

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setsByExercise = await getSetsForExercises(exerciseIds);

  const exercisesBySession = new Map<number, SessionExercise[]>();
  for (const e of exerciseRows) {
    const arr = exercisesBySession.get(e.session_id) ?? [];
    arr.push({
      ...e,
      sets: setsByExercise.get(e.id) ?? [],
    });
    exercisesBySession.set(e.session_id, arr);
  }

  const sessions: Session[] = sessionRows.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    routine_id: s.routine_id,
    date: toISODate(s.date),
    created_at: s.created_at,
    exercises: exercisesBySession.get(s.id) ?? [],
  }));

  return { sessions, total, page, limit };
};

const getSetsForExercises = async (
  exerciseIds: number[]
): Promise<Map<number, ExerciseSet[]>> => {
  if (exerciseIds.length === 0) return new Map();

  const result = await pool.query(
    `SELECT id, session_exercise_id, reps, weight::numeric::text AS weight_text, order_index
     FROM exercise_sets
     WHERE session_exercise_id = ANY($1::int[])
     ORDER BY session_exercise_id ASC, order_index ASC, id ASC`,
    [exerciseIds]
  );

  const map = new Map<number, ExerciseSet[]>();
  for (const row of result.rows as Array<{
    id: number;
    session_exercise_id: number;
    reps: number;
    weight_text: string;
    order_index: number;
  }>) {
    const arr = map.get(row.session_exercise_id) ?? [];
    arr.push({
      id: row.id,
      session_exercise_id: row.session_exercise_id,
      reps: row.reps,
      weight: parseFloat(row.weight_text),
      order_index: row.order_index,
    });
    map.set(row.session_exercise_id, arr);
  }
  return map;
};

/**
 * Processes a new training session:
 * 1. Saves session + exercises + sets in a transaction
 * 2. Calculates XP gains from exercises (iterating each set's weight × reps)
 * 3. Applies gains to user stats (with level-up handling)
 * 4. Updates streak and tenacity (only when the session's date is today)
 * 5. Checks milestones and returns any newly unlocked ones
 */
export const processSession = async (
  userId: number,
  input: CreateSessionInput
) => {
  const currentStats = await statsService.findByUserId(userId);
  if (!currentStats) {
    const error = new Error('Stats not initialized');
    (error as Error & { code: string }).code = 'STATS_NOT_FOUND';
    throw error;
  }

  const session = await createSession(userId, input);

  const gains = calculateGains(input.exercises);
  const statUpdates = applyGains(currentStats, gains);

  const today = toISODate(new Date());
  const isToday = session.date === today;

  let streak = currentStats.streak;
  let bestStreak = currentStats.best_streak;
  let lastSessionDate: string | Date | null = currentStats.last_session_date;
  let tenacityValue = currentStats.tenacity;
  let tenacityLevel = currentStats.tenacity_level;

  if (isToday) {
    const lastDate = currentStats.last_session_date
      ? new Date(currentStats.last_session_date)
      : null;
    if (lastDate) lastDate.setHours(0, 0, 0, 0);
    const todayMidnight = new Date(today);
    todayMidnight.setHours(0, 0, 0, 0);

    const diffDays = lastDate
      ? Math.floor(
          (todayMidnight.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      : -1;

    if (diffDays === 1) {
      streak += 1;
    } else if (diffDays !== 0) {
      streak = 1;
    }

    bestStreak = Math.max(bestStreak, streak);
    lastSessionDate = today;

    const tenacityXp = currentStats.tenacity + 5;
    let level = currentStats.tenacity_level;
    let xp = tenacityXp;
    while (xp >= 100) {
      xp -= 100;
      level += 1;
    }
    tenacityValue = xp;
    tenacityLevel = level;
  }

  const updatedStats = await statsService.updateStats(userId, {
    ...statUpdates,
    tenacity: tenacityValue,
    tenacity_level: tenacityLevel,
    streak,
    best_streak: bestStreak,
    last_session_date: lastSessionDate,
  });

  // Evaluate character class progression. Non-critical; never fail the session.
  try {
    await characterService.evaluateAfterStatsUpdate(userId, {
      strength: updatedStats.strength_level,
      endurance: updatedStats.endurance_level,
      stamina: updatedStats.stamina_level,
      agility: updatedStats.agility_level,
      tenacity: updatedStats.tenacity_level,
      vigor: updatedStats.vigor_level,
    });
  } catch (err) {
    logger.warn(
      { err, userId },
      'Character progression evaluation failed after session save'
    );
  }

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
  } catch (err) {
    // Milestone check failed — session and stats are already saved.
    logger.warn({ err, userId }, 'Milestone check failed after session save');
  }

  return { session, stats: updatedStats, newMilestones };
};
