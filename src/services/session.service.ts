import pool from '../db/pool';
import type { UnlockedMilestone } from '../models/Milestone';
import type {
  CreateSessionInput,
  ExerciseSet,
  Session,
  SessionExercise,
} from '../models/Session';
import { localTodayISO, parseLocalDay } from '../utils/date';
import { logger } from '../utils/logger';
import { parseDaysPerWeekTarget } from '../utils/weeklyTarget';
import * as characterService from './character.service';
import { getExerciseMetaById, getExerciseTypeById } from './exercise.service';
import * as milestoneService from './milestone.service';
import {
  applyGains,
  applyXpToLevel,
  calculateGains,
  DAILY_XP_CAPS,
  TENACITY_BASE_PER_SESSION,
  TENACITY_STREAK_BONUS_BASE,
  TENACITY_STREAK_BONUS_CAP,
  TENACITY_STREAK_BONUS_STEP,
  VIGOR_PER_SESSION,
} from './progression.service';
import * as statsService from './stats.service';
import { calculateStreak, isoWeekMonday } from './streak.service';

/**
 * SQL helpers for the routine-target streak. Live in session.service
 * because they're orchestration utilities (not pure date math); the
 * pure logic stays in streak.service.
 *
 * Both queries are cheap: indexed by user_id + date.
 */

/**
 * Distinct training DAYS in the ISO week starting at `weekMonday` (UTC
 * 00:00). Two sessions on the same day count as one day toward the
 * weekly target — `days_per_week` measures days, not sessions.
 */
export const countTrainingDaysInWeek = async (
  userId: number,
  weekMonday: Date
): Promise<number> => {
  const weekEnd = new Date(weekMonday.getTime() + 7 * 86_400_000);
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT date) AS count
       FROM sessions
      WHERE user_id = $1
        AND date >= $2
        AND date <  $3`,
    [
      userId,
      weekMonday.toISOString().slice(0, 10),
      weekEnd.toISOString().slice(0, 10),
    ]
  );
  return Number(result.rows[0]?.count ?? 0);
};

/**
 * Resolves the user's weekly training target from their onboarding
 * `days_per_week` answer. Falls back to 1 (loose) when missing.
 */
export const getUserWeeklyTarget = async (userId: number): Promise<number> => {
  const result = await pool.query<{ days_per_week: string | null }>(
    `SELECT days_per_week FROM users WHERE id = $1`,
    [userId]
  );
  return parseDaysPerWeekTarget(result.rows[0]?.days_per_week);
};

/**
 * Derives the gameplay ExerciseType from the bundled catalog for normal
 * exercises. The client hardcodes 'strength' for every catalog exercise
 * (see useWorkoutState.buildPayloadExercises) — without this override only
 * the FUERZA stat ever earned XP, regardless of whether the user did
 * cardio, stretching, or plyometrics.
 *
 * Cardio entries (duration_minutes set) are different: they don't live in
 * the exercise catalog — their stat pillar comes from the activity meta in
 * the client (HIIT → explosive, bike → cardio, yoga → stretch). For those
 * we trust the type the client sent rather than running it through the
 * catalog lookup, which would fall back to 'strength' for any unknown id.
 */
/** Synthetic-id prefixes that the catalog doesn't index. The client
 *  builds them when the source is a template (`tpl-*`) or a free-form
 *  cardio block (`cardio:*`); falling back to `getExerciseTypeById`
 *  on these ids would always resolve 'strength' and silently bleed
 *  XP from cardio/stretch days into FUERZA. We trust the client's
 *  type label for these prefixes — the prefix itself is the signal
 *  that the id can't be looked up. */
const SYNTHETIC_ID_PREFIXES = ['tpl-', 'cardio:'];

const isSyntheticExerciseId = (apiId: string): boolean =>
  SYNTHETIC_ID_PREFIXES.some((prefix) => apiId.startsWith(prefix));

const resolveExerciseTypes = (
  input: CreateSessionInput
): CreateSessionInput => ({
  ...input,
  exercises: input.exercises.map((exercise) => ({
    ...exercise,
    type:
      exercise.duration_minutes !== undefined ||
      isSyntheticExerciseId(exercise.exercise_api_id)
        ? exercise.type
        : getExerciseTypeById(exercise.exercise_api_id),
  })),
});

const BODYWEIGHT_EQUIPMENT_KEYS = new Set(['bodyonly', 'bodyweight']);

const isBodyweightCatalog = (apiId: string): boolean => {
  // Cardio synthetic ids (`cardio:<...>`) won't be in the catalog and
  // shouldn't be treated as bodyweight even if the lookup falls back.
  if (apiId.startsWith('cardio:')) return false;
  const meta = getExerciseMetaById(apiId);
  return BODYWEIGHT_EQUIPMENT_KEYS.has(
    meta.equipment.toLowerCase().replace(/\s+/g, '')
  );
};

/**
 * Body weight (kg) for the user, or null if missing. Used to stamp
 * bodyweight-set sets with the user's current load so volume metrics
 * (totalVolume, weekly summary, TOTAL_WEIGHT milestone) and XP
 * (volume-based fuerza) reflect actual work done — push-ups would
 * otherwise read as zero kilos lifted.
 */
const getUserBodyweightKg = async (userId: number): Promise<number | null> => {
  const result = await pool.query<{ weight: string | null }>(
    `SELECT weight::text AS weight FROM users WHERE id = $1`,
    [userId]
  );
  const raw = result.rows[0]?.weight;
  if (!raw) return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Returns a copy of `input` with bodyweight-exercise sets re-stamped
 * to use the user's current bodyweight. Sets that already carry an
 * external load (rare for pure bodyweight moves but possible — weighted
 * pull-ups, vest push-ups) keep that value; only `weight === 0` is
 * substituted, so the user can still log added load when applicable.
 */
const applyBodyweightLoad = (
  input: CreateSessionInput,
  bodyweight: number | null
): CreateSessionInput => {
  if (!bodyweight) return input;
  return {
    ...input,
    exercises: input.exercises.map((exercise) => {
      if (!isBodyweightCatalog(exercise.exercise_api_id)) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map((set) =>
          set.weight === 0 ? { ...set, weight: bodyweight } : set
        ),
      };
    }),
  };
};

const countUserSessions = async (userId: number): Promise<number> => {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].total;
};

const getTotalWeightLifted = async (userId: number): Promise<number> => {
  // SUM is `numeric` (because `weight` is `DECIMAL(6,2)`), and pg
  // serialises numerics as strings. Cast to `::float8` server-side so
  // the value comes back as a JS number with the fractional kg
  // preserved — the previous `::int` truncated 500.5 kg to 500,
  // pushing TOTAL_WEIGHT milestone awards slightly off when many
  // partial-plate sets accumulate.
  const result = await pool.query(
    `SELECT COALESCE(SUM(es.weight * es.reps), 0)::float8 AS total
     FROM exercise_sets es
     JOIN session_exercises se ON se.id = es.session_exercise_id
     JOIN sessions s ON s.id = se.session_id
     WHERE s.user_id = $1`,
    [userId]
  );
  return result.rows[0].total;
};

/**
 * Per-stat XP movement carried back in the session save response.
 * `delta` is the raw amount earned this session (post-cap, pre-overflow);
 * `before*`/`after*` let the client animate the bar from its old position
 * through any level-ups to its new position without recomputing caps.
 */
export interface SessionGainEntry {
  delta: number;
  beforeXp: number;
  beforeLevel: number;
  afterXp: number;
  afterLevel: number;
}

export interface SessionGains {
  totalXp: number;
  /** Current streak count after this session — drives "racha x3" copy. */
  streak: number;
  /** False when the session was backdated; tenacity/vigor stay flat then. */
  isToday: boolean;
  perStat: {
    strength: SessionGainEntry;
    endurance: SessionGainEntry;
    stamina: SessionGainEntry;
    agility: SessionGainEntry;
    tenacity: SessionGainEntry;
    vigor: SessionGainEntry;
  };
}

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
  // Compute week bounds in JS so they share `isoWeekMonday`'s local-time
  // semantics. `date_trunc('week', CURRENT_DATE)` would resolve against
  // the pool's UTC session and disagreed with the client's perceived
  // "this week" any time the local week had advanced past UTC's (e.g.
  // Mon 00:30 CEST → still Sun in UTC → bounds bucketed today's session
  // into "previous" instead of "current").
  const now = new Date();
  const currentStart = isoWeekMonday(now);
  const previousStart = new Date(currentStart.getTime() - 7 * 86_400_000);
  const nextStart = new Date(currentStart.getTime() + 7 * 86_400_000);
  const currentStr = currentStart.toISOString().slice(0, 10);
  const previousStr = previousStart.toISOString().slice(0, 10);
  const nextStr = nextStart.toISOString().slice(0, 10);

  const result = await pool.query<WeeklyMetricsRow>(
    `WITH bounds AS (
       SELECT
         $2::date AS current_start,
         $3::date AS previous_start,
         $4::date AS next_start
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
    [userId, currentStr, previousStr, nextStr]
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
 * Internal helper used by `processSession` to insert a session +
 * its exercises + its sets inside a CALLER-MANAGED transaction.
 * Returns the new session id.
 *
 * Caller responsibilities:
 *   - call BEGIN before, COMMIT/ROLLBACK after
 *   - release the client
 *   - read back the session via getSessionDetail AFTER commit
 *
 * The stats read + update path runs against the same client so the
 * full read-compute-write cycle is serialised by one row lock.
 */
const insertSessionInTx = async (
  client: import('pg').PoolClient,
  userId: number,
  input: CreateSessionInput
): Promise<number> => {
  // Routine-ownership check. The FK on `sessions.routine_id` only
  // enforces that *some* routine row exists — it does not constrain
  // the routine to belong to this user. Without this query, Bob can
  // submit a session referencing Alice's routine ID and pollute her
  // analytics + leak the existence/IDs of her routines through his
  // session-history endpoint. The check has to happen inside the
  // transaction so a concurrent DELETE of the routine doesn't slip
  // a now-orphan reference past the FK.
  if (input.routine_id !== null && input.routine_id !== undefined) {
    const owns = await client.query<{ id: number }>(
      `SELECT id FROM routines
        WHERE id = $1 AND user_id = $2
        LIMIT 1`,
      [input.routine_id, userId]
    );
    if (owns.rowCount === 0) {
      const err = new Error('ROUTINE_NOT_OWNED') as Error & { code: string };
      err.code = 'ROUTINE_NOT_OWNED';
      throw err;
    }
  }

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
      const base = i * 8;
      seValues.push(
        sessionId,
        exercise.exercise_api_id,
        exercise.name,
        exercise.type,
        i,
        exercise.duration_minutes ?? null,
        exercise.intensity ?? null,
        exercise.distance_km ?? null
      );
      // Cast intensity placeholder to the enum type so a NULL on a
      // strength entry doesn't trip Postgres parameter type inference.
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::"CardioIntensity", $${base + 8})`;
    })
    .join(', ');

  const seResult = await client.query(
    `INSERT INTO session_exercises (session_id, exercise_api_id, name, type, order_index, duration_minutes, intensity, distance_km)
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
      setValues.push(
        sessionExerciseId,
        set.reps,
        set.weight,
        set.duration_seconds ?? null,
        setIdx
      );
      setPlaceholders.push(
        `($${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`
      );
      paramIdx += 5;
    });
  });

  if (setPlaceholders.length > 0) {
    await client.query(
      `INSERT INTO exercise_sets (session_exercise_id, reps, weight, duration_seconds, order_index)
       VALUES ${setPlaceholders.join(', ')}`,
      setValues
    );
  }

  return sessionId;
};

/**
 * Returns a single session for the given user with exercises and sets fully
 * hydrated. Returns null if the session does not exist or belongs to another user.
 */
export const getSessionDetail = async (
  userId: number,
  sessionId: number
): Promise<Session | null> => {
  // `date::text` keeps Postgres from emitting a JS Date that node-pg
  // would parse at *local* midnight — toISODate runs `toISOString()`
  // and would shift the result one day back in any TZ ahead of UTC.
  // The text path returns the raw YYYY-MM-DD that was stored, which
  // is also the format `localTodayISO` produces, so the `isToday`
  // comparison and the "prior sessions today" lookup line up.
  const sessionResult = await pool.query(
    `SELECT id, user_id, routine_id, date::text AS date, created_at
     FROM sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const session = sessionResult.rows[0] as
    | {
        id: number;
        user_id: number;
        routine_id: number | null;
        date: string;
        created_at: Date;
      }
    | undefined;
  if (!session) return null;

  const exercisesResult = await pool.query(
    `SELECT id, session_id, exercise_api_id, name, type, order_index,
            duration_minutes, intensity, distance_km::numeric::text AS distance_km_text
     FROM session_exercises
     WHERE session_id = $1
     ORDER BY order_index ASC, id ASC`,
    [sessionId]
  );
  const exerciseRows = exercisesResult.rows as Array<
    Omit<SessionExercise, 'sets' | 'distance_km'> & {
      distance_km_text: string | null;
    }
  >;

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setsByExercise = await getSetsForExercises(exerciseIds);

  const exercises: SessionExercise[] = exerciseRows.map((e) => ({
    ...e,
    distance_km:
      e.distance_km_text !== null ? parseFloat(e.distance_km_text) : null,
    sets: setsByExercise.get(e.id) ?? [],
  }));

  return {
    id: session.id,
    user_id: session.user_id,
    routine_id: session.routine_id,
    // session.date is already a YYYY-MM-DD string thanks to the
    // `date::text` cast above — pass it through verbatim.
    date: session.date,
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
    `SELECT id, user_id, routine_id, date::text AS date, created_at
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
    date: string;
    created_at: Date;
  }>;

  if (sessionRows.length === 0) {
    return { sessions: [], total, page, limit };
  }

  const sessionIds = sessionRows.map((s) => s.id);

  const exercisesResult = await pool.query(
    `SELECT id, session_id, exercise_api_id, name, type, order_index,
            duration_minutes, intensity, distance_km::numeric::text AS distance_km_text
     FROM session_exercises
     WHERE session_id = ANY($1::int[])
     ORDER BY session_id ASC, order_index ASC, id ASC`,
    [sessionIds]
  );
  const exerciseRows = exercisesResult.rows as Array<
    Omit<SessionExercise, 'sets' | 'distance_km'> & {
      distance_km_text: string | null;
    }
  >;

  const exerciseIds = exerciseRows.map((e) => e.id);
  const setsByExercise = await getSetsForExercises(exerciseIds);

  const exercisesBySession = new Map<number, SessionExercise[]>();
  for (const e of exerciseRows) {
    const arr = exercisesBySession.get(e.session_id) ?? [];
    arr.push({
      ...e,
      distance_km:
        e.distance_km_text !== null ? parseFloat(e.distance_km_text) : null,
      sets: setsByExercise.get(e.id) ?? [],
    });
    exercisesBySession.set(e.session_id, arr);
  }

  const sessions: Session[] = sessionRows.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    routine_id: s.routine_id,
    date: s.date,
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
    `SELECT id, session_exercise_id, reps, weight::numeric::text AS weight_text,
            duration_seconds, order_index
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
    duration_seconds: number | null;
    order_index: number;
  }>) {
    const arr = map.get(row.session_exercise_id) ?? [];
    arr.push({
      id: row.id,
      session_exercise_id: row.session_exercise_id,
      reps: row.reps,
      weight: parseFloat(row.weight_text),
      duration_seconds: row.duration_seconds,
      order_index: row.order_index,
    });
    map.set(row.session_exercise_id, arr);
  }
  return map;
};

/**
 * Daily XP ceilings per stat. Same numbers as the per-session caps in
 * progression.service so one focused session can fill the day's allowance —
 * a second session in the same day grants 0 for any stat already at cap.
 *
 * Without this, doing 2-3 sessions in one day would simply multiply XP,
 * making "grind sessions" the optimal play and a single solid workout
 * feel underweighted. Daily caps make session count irrelevant: it's the
 * total work that matters.
 *
 * (Constants live in progression.service so all XP knobs are in one
 * place — see DAILY_XP_CAPS, TENACITY_*, VIGOR_* there.)
 */

// `sumPriorGainsForDate` was the read-back of "what did the user
// already earn today" so the daily-cap branch could subtract it. With
// the unique(user_id, date) index in place, the query always returned
// 0 prior sessions — making this function dead code on every call.
// Removed; processSession's daily-cap branch now uses an empty totals
// snapshot, preserving the cap logic shape for the day the constraint
// is relaxed (multi-session-per-day) without the round-trip cost on
// every save.

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
  const bodyweight = await getUserBodyweightKg(userId);
  const resolved = applyBodyweightLoad(resolveExerciseTypes(input), bodyweight);

  // Open ONE transaction for the entire write path. Two concurrent
  // saves for the same user used to read the same `currentStats`,
  // compute deltas independently, and have the second writer clobber
  // the first — silently destroying XP. The unique(user_id, date)
  // index only prevents duplicate same-day inserts; backdating
  // yesterday-then-today is a different-date pair that still raced.
  // Locking the stats row inside the same transaction as the session
  // insert serialises every save for a user without blocking saves
  // for different users.
  type StatsRow = {
    strength: number;
    strength_level: number;
    endurance: number;
    endurance_level: number;
    stamina: number;
    stamina_level: number;
    agility: number;
    agility_level: number;
    tenacity: number;
    tenacity_level: number;
    vigor: number;
    vigor_level: number;
    streak: number;
    best_streak: number;
    last_session_date: string | Date | null;
    last_qualifying_week_monday: string | Date | null;
    [key: string]: unknown;
  };

  const client = await pool.connect();
  let sessionId: number;
  let currentStats: StatsRow;
  let updatedStats: Record<string, unknown>;
  let gains: ReturnType<typeof calculateGains>;
  let isToday: boolean;
  let tenacityGain = 0;
  let vigorGain = 0;
  let streak: number;
  try {
    await client.query('BEGIN');

    sessionId = await insertSessionInTx(client, userId, resolved);

    // Lock the stats row for the duration of the transaction. This is
    // the line that closes the lost-update race: any other concurrent
    // processSession for the same user will block here until we
    // COMMIT, then read the updated row.
    const lockResult = await client.query(
      `SELECT *,
              last_session_date::text AS last_session_date,
              last_qualifying_week_monday::text AS last_qualifying_week_monday,
              last_diet_date::text AS last_diet_date
         FROM stats
        WHERE user_id = $1
        FOR UPDATE`,
      [userId]
    );
    const row = lockResult.rows[0] as StatsRow | undefined;
    if (!row) {
      const error = new Error('Stats not initialized');
      (error as Error & { code: string }).code = 'STATS_NOT_FOUND';
      throw error;
    }
    currentStats = row;

    gains = calculateGains(resolved.exercises);

    const today = localTodayISO();
    const sessionDateStr = input.date;
    isToday = sessionDateStr === today;

    // Daily-cap branch is left in place defensively even though the
    // unique(user_id, date) index makes priorSessionsToday always 0
    // today — if that constraint is ever relaxed to allow multiple
    // sessions per day, the cap kicks in without re-reading this code.
    // Empty totals mirror the no-prior-session case.
    const earnedToday = {
      sessionCount: 0,
      totals: {} as Record<string, number>,
    };
    const priorSessionsToday = earnedToday.sessionCount;
    for (const [key, gain] of Array.from(gains.entries())) {
      const cap = DAILY_XP_CAPS[key];
      if (cap === undefined) continue;
      const remaining = Math.max(0, cap - (earnedToday.totals[key] ?? 0));
      gain.xp = Math.min(gain.xp, remaining);
      if (gain.xp <= 0) gains.delete(key);
    }

    const statUpdates = applyGains(
      currentStats as unknown as Record<string, number>,
      gains
    );

    streak = currentStats.streak;
    let bestStreak = currentStats.best_streak;
    let lastSessionDate: string | Date | null =
      currentStats.last_session_date ?? null;
    let tenacityValue = currentStats.tenacity;
    let tenacityLevel = currentStats.tenacity_level;
    let vigorValue = currentStats.vigor;
    let vigorLevel = currentStats.vigor_level;
    let lastQualifyingWeekMonday: string | Date | null =
      currentStats.last_qualifying_week_monday ?? null;

    if (isToday) {
      const sessionDate = parseLocalDay(today);
      const thisWeekMonday = isoWeekMonday(sessionDate);
      const lastWeekMonday = new Date(
        thisWeekMonday.getTime() - 7 * 86_400_000
      );

      const [target, sessionsThisWeek, sessionsLastWeek] = await Promise.all([
        getUserWeeklyTarget(userId),
        countTrainingDaysInWeek(userId, thisWeekMonday),
        countTrainingDaysInWeek(userId, lastWeekMonday),
      ]);

      const streakResult = calculateStreak({
        current: {
          streak: currentStats.streak,
          best_streak: currentStats.best_streak,
          last_session_date: currentStats.last_session_date
            ? new Date(currentStats.last_session_date)
            : null,
          last_qualifying_week_monday: currentStats.last_qualifying_week_monday
            ? new Date(currentStats.last_qualifying_week_monday)
            : null,
        },
        target,
        sessionsThisWeek,
        sessionsLastWeek,
        sessionDate,
      });
      streak = streakResult.streak;
      bestStreak = streakResult.best_streak;
      lastSessionDate = streakResult.last_session_date;
      lastQualifyingWeekMonday =
        streakResult.last_qualifying_week_monday || null;

      if (priorSessionsToday === 0) {
        tenacityGain =
          TENACITY_BASE_PER_SESSION +
          Math.min(
            TENACITY_STREAK_BONUS_CAP,
            TENACITY_STREAK_BONUS_BASE + streak * TENACITY_STREAK_BONUS_STEP
          );
        const { xp: nextTenacityXp, level: nextTenacityLevel } = applyXpToLevel(
          currentStats.tenacity_level,
          currentStats.tenacity + tenacityGain
        );
        tenacityValue = nextTenacityXp;
        tenacityLevel = nextTenacityLevel;

        vigorGain = VIGOR_PER_SESSION;
        const { xp: nextVigorXp, level: nextVigorLevel } = applyXpToLevel(
          currentStats.vigor_level,
          currentStats.vigor + vigorGain
        );
        vigorValue = nextVigorXp;
        vigorLevel = nextVigorLevel;
      }
    }

    // Apply stats UPDATE inside the same transaction so the lock
    // guarantees the SELECT we read above is the value we're updating.
    updatedStats = await statsService.updateStatsInTx(client, userId, {
      ...statUpdates,
      tenacity: tenacityValue,
      tenacity_level: tenacityLevel,
      vigor: vigorValue,
      vigor_level: vigorLevel,
      streak,
      best_streak: bestStreak,
      last_session_date: lastSessionDate,
      last_qualifying_week_monday: lastQualifyingWeekMonday,
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  // Read the session detail back AFTER commit — the join across
  // sessions+session_exercises+exercise_sets is heavy and we don't
  // want to hold locks while building the response. Stats are already
  // updated and returned by the in-tx update above.
  const session = await getSessionDetail(userId, sessionId);
  if (!session) {
    throw new Error('Failed to read back created session');
  }

  // Evaluate character class progression. Non-critical; never fail the session.
  const us = updatedStats as Record<string, number>;
  try {
    await characterService.evaluateAfterStatsUpdate(userId, {
      strength: us.strength_level,
      endurance: us.endurance_level,
      stamina: us.stamina_level,
      agility: us.agility_level,
      tenacity: us.tenacity_level,
      vigor: us.vigor_level,
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
      us.strength_level,
      us.endurance_level,
      us.stamina_level,
      us.agility_level,
      us.tenacity_level,
      us.vigor_level,
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

  // Build the per-stat XP delta payload the client modal animates over.
  // Sourcing the deltas server-side (instead of having the client diff
  // before/after) means caps, multipliers and level-ups are computed in
  // exactly one place — the modal just paints what it receives.
  const rawGainsByKey: Record<string, number> = {
    strength: gains.get('strength')?.xp ?? 0,
    endurance: gains.get('endurance')?.xp ?? 0,
    stamina: gains.get('stamina')?.xp ?? 0,
    agility: gains.get('agility')?.xp ?? 0,
    tenacity: tenacityGain,
    vigor: vigorGain,
  };

  const buildEntry = (
    statKey: string,
    levelKey: string,
    delta: number
  ): SessionGainEntry => ({
    delta,
    beforeXp: currentStats[statKey] as number,
    beforeLevel: currentStats[levelKey] as number,
    afterXp: updatedStats[statKey] as number,
    afterLevel: updatedStats[levelKey] as number,
  });

  const sessionGains: SessionGains = {
    totalXp: Object.values(rawGainsByKey).reduce((a, b) => a + b, 0),
    streak,
    isToday,
    perStat: {
      strength: buildEntry(
        'strength',
        'strength_level',
        rawGainsByKey.strength
      ),
      endurance: buildEntry(
        'endurance',
        'endurance_level',
        rawGainsByKey.endurance
      ),
      stamina: buildEntry('stamina', 'stamina_level', rawGainsByKey.stamina),
      agility: buildEntry('agility', 'agility_level', rawGainsByKey.agility),
      tenacity: buildEntry(
        'tenacity',
        'tenacity_level',
        rawGainsByKey.tenacity
      ),
      vigor: buildEntry('vigor', 'vigor_level', rawGainsByKey.vigor),
    },
  };

  return {
    session,
    stats: updatedStats,
    newMilestones,
    gains: sessionGains,
  };
};
