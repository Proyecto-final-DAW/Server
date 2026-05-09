import pool from '../db/pool';
import type { UnlockedMilestone } from '../models/Milestone';
import type {
  CardioIntensity,
  CreateSessionExerciseInput,
  CreateSessionInput,
  ExerciseSet,
  ExerciseType,
  Session,
  SessionExercise,
} from '../models/Session';
import { logger } from '../utils/logger';
import { parseDaysPerWeekTarget } from '../utils/weeklyTarget';
import * as characterService from './character.service';
import { getExerciseMetaById, getExerciseTypeById } from './exercise.service';
import * as milestoneService from './milestone.service';
import { applyGains, applyXpToLevel, calculateGains } from './progression.service';
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

const toISODate = (date: Date | string): string => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Local-timezone YYYY-MM-DD for comparing against the date the client sent.
 *
 * The client builds `todayISO()` from `getFullYear/getMonth/getDate` (local
 * time), so the server has to match that — using `toISOString()` here would
 * silently flip the date for any user in a TZ ahead of UTC between local
 * midnight and UTC midnight (e.g. 00:00–02:00 in CEST), making `isToday`
 * false and skipping the tenacity / vigor / streak updates for half the
 * "late night" sessions. Local-formatted comparison is correct as long as
 * server TZ matches the user's, which holds in dev (single-machine) and is
 * easy to enforce in prod by pinning TZ to UTC and having the client also
 * send UTC.
 */
const localTodayISO = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses a `YYYY-MM-DD` string back into a Date at *local* midnight,
 * mirroring how `localTodayISO()` produced it. `new Date(yyyy-mm-dd)`
 * would parse the same string as UTC midnight, which then leaks into
 * `isoWeekMonday()` via the local-time getters and shifts the ISO
 * week one day back at year/week boundaries in any TZ behind UTC.
 * Building the Date from explicit components keeps the local-day
 * stable end-to-end.
 */
const parseLocalDay = (yyyyMmDd: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyyMmDd);
  if (!match) return new Date(yyyyMmDd);
  return new Date(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10)
  );
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
    distance_km: e.distance_km_text !== null ? parseFloat(e.distance_km_text) : null,
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
 */
const DAILY_XP_CAPS: Record<string, number> = {
  strength: 60,
  endurance: 40,
  stamina: 50,
  agility: 30,
};

/**
 * Sums XP earned today from every session OTHER than `excludeSessionId`,
 * by replaying `calculateGains` over each one. Reading the raw exercise
 * data and recomputing (rather than storing daily totals) keeps the data
 * model simple — there's no "xp_today_*" snapshot column to drift, and a
 * future change to `calculateGains` automatically rebalances the daily
 * totals on the next save.
 *
 * Returns both the per-stat totals and the count of prior sessions, so
 * the caller can also gate "first-session-only" rewards (tenacity/vigor)
 * without a second query.
 */
const sumPriorGainsForDate = async (
  userId: number,
  date: string,
  excludeSessionId: number
): Promise<{ totals: Record<string, number>; sessionCount: number }> => {
  const sessionResult = await pool.query<{ id: number }>(
    `SELECT id FROM sessions
        WHERE user_id = $1 AND date = $2 AND id != $3`,
    [userId, date, excludeSessionId]
  );
  const sessionIds = sessionResult.rows.map((r) => r.id);

  if (sessionIds.length === 0) {
    return { totals: {}, sessionCount: 0 };
  }

  const exercisesResult = await pool.query<{
    id: number;
    session_id: number;
    exercise_api_id: string;
    name: string;
    type: ExerciseType;
    duration_minutes: number | null;
    intensity: CardioIntensity | null;
  }>(
    `SELECT id, session_id, exercise_api_id, name, type, duration_minutes, intensity
       FROM session_exercises
      WHERE session_id = ANY($1::int[])`,
    [sessionIds]
  );
  const exerciseRows = exercisesResult.rows;
  const exerciseIds = exerciseRows.map((e) => e.id);
  const setsByExercise = await getSetsForExercises(exerciseIds);

  // Group adapted exercises per session so each session's gains can be
  // computed independently — calculateGains has per-exercise caps that
  // wouldn't apply correctly if everything was flattened.
  const exercisesBySession = new Map<number, CreateSessionExerciseInput[]>();
  for (const e of exerciseRows) {
    const adapted: CreateSessionExerciseInput = {
      exercise_api_id: e.exercise_api_id,
      name: e.name,
      type: e.type,
      sets: (setsByExercise.get(e.id) ?? []).map((s) => ({
        reps: s.reps,
        weight: s.weight,
        duration_seconds: s.duration_seconds,
      })),
      duration_minutes: e.duration_minutes ?? undefined,
      intensity: e.intensity ?? undefined,
    };
    const arr = exercisesBySession.get(e.session_id) ?? [];
    arr.push(adapted);
    exercisesBySession.set(e.session_id, arr);
  }

  const totals: Record<string, number> = {
    strength: 0,
    endurance: 0,
    stamina: 0,
    agility: 0,
  };
  for (const exercises of exercisesBySession.values()) {
    const priorGains = calculateGains(exercises);
    for (const [key, gain] of priorGains) {
      totals[key] = (totals[key] ?? 0) + gain.xp;
    }
  }

  return { totals, sessionCount: sessionIds.length };
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

  const bodyweight = await getUserBodyweightKg(userId);
  const resolved = applyBodyweightLoad(resolveExerciseTypes(input), bodyweight);

  const session = await createSession(userId, resolved);

  const gains = calculateGains(resolved.exercises);

  const today = localTodayISO();
  const isToday = session.date === today;

  // Daily-cap headroom. If the user already trained earlier today, replay
  // those sessions' gains and shrink each stat's new gain so total daily
  // XP per stat never exceeds DAILY_XP_CAPS. Backdated sessions skip this
  // (they have their own day's allowance, untouched by other days).
  let priorSessionsToday = 0;
  if (isToday) {
    const earnedToday = await sumPriorGainsForDate(
      userId,
      session.date,
      session.id
    );
    priorSessionsToday = earnedToday.sessionCount;

    for (const [key, gain] of Array.from(gains.entries())) {
      const cap = DAILY_XP_CAPS[key];
      if (cap === undefined) continue;
      const remaining = Math.max(0, cap - (earnedToday.totals[key] ?? 0));
      gain.xp = Math.min(gain.xp, remaining);
      // Drop fully-capped stats so the response gain entry shows a clean
      // delta of 0 (computed below from before/after parity) and applyGains
      // doesn't waste a level-recompute on a zero increment.
      if (gain.xp <= 0) gains.delete(key);
    }
  }

  const statUpdates = applyGains(currentStats, gains);

  let streak = currentStats.streak;
  let bestStreak = currentStats.best_streak;
  let lastSessionDate: string | Date | null = currentStats.last_session_date;
  let tenacityValue = currentStats.tenacity;
  let tenacityLevel = currentStats.tenacity_level;
  let vigorValue = currentStats.vigor;
  let vigorLevel = currentStats.vigor_level;

  let lastQualifyingWeekMonday:
    | string
    | Date
    | null = currentStats.last_qualifying_week_monday;

  // Lifted out of the `if (isToday)` block so the post-session response
  // can report the raw amount each pillar gained — even when 0. The
  // client modal uses these to render `+N XP` badges over each bar.
  let tenacityGain = 0;
  let vigorGain = 0;

  if (isToday) {
    // Routine-target weekly streak. Need to know:
    //   - the user's target (days/week from onboarding),
    //   - distinct training days this ISO week (including today),
    //   - distinct training days the previous ISO week.
    // The session that's being saved is already in `sessions` (it was
    // INSERT-ed in createSession a moment earlier), so the count
    // queries see it.
    // `today` is a local-day string from `localTodayISO()`. Parse via
    // explicit components so the resulting Date is at local midnight —
    // a plain `new Date(today)` would round-trip through UTC and shift
    // the ISO week boundary by one day at year/week edges in any TZ
    // behind UTC.
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

    // Tenacity and Vigor are *daily* rewards, not per-session: they
    // represent showing up today, not the volume of work. Awarding them
    // on every save would let a user grind 3 sessions to triple-dip the
    // bonus. Gate on `priorSessionsToday === 0` so only the first save
    // of the day moves these bars; subsequent sessions that day still
    // earn fuerza/resistencia/estamina/agilidad up to the daily cap.
    if (priorSessionsToday === 0) {
      // Tenacity rewards weekly consistency. Base 10 + a streak bonus
      // that *starts at half* the cap (+15) and rises 3× per week up to
      // the +30 cap. So week 1 already gives +18 (10 base + 18 bonus =
      // 28 XP) instead of the +13 a from-scratch multiplier would give —
      // a "voto de confianza" so a brand-new user sees real movement on
      // tenacidad after their first session, not a sliver. The cap is
      // hit at week 5 (15 + 5×3 = 30) instead of week 10.
      tenacityGain = 10 + Math.min(30, 15 + streak * 3);
      const { xp: nextTenacityXp, level: nextTenacityLevel } = applyXpToLevel(
        currentStats.tenacity_level,
        currentStats.tenacity + tenacityGain
      );
      tenacityValue = nextTenacityXp;
      tenacityLevel = nextTenacityLevel;

      // Vigor: flat 20 per session. The diet reward (+10) lives at
      // diet log-time (see diet.service.logDietForToday) so the user
      // gets immediate feedback on the COMPLETAR DIETA tap. Net daily
      // cap when doing both: 20 + 10 = 30 — training is the heavier
      // source, eating well alone still moves the bar on rest days.
      vigorGain = 20;
      const { xp: nextVigorXp, level: nextVigorLevel } = applyXpToLevel(
        currentStats.vigor_level,
        currentStats.vigor + vigorGain
      );
      vigorValue = nextVigorXp;
      vigorLevel = nextVigorLevel;
    }
  }

  const updatedStats = await statsService.updateStats(userId, {
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
      strength: buildEntry('strength', 'strength_level', rawGainsByKey.strength),
      endurance: buildEntry(
        'endurance',
        'endurance_level',
        rawGainsByKey.endurance
      ),
      stamina: buildEntry('stamina', 'stamina_level', rawGainsByKey.stamina),
      agility: buildEntry('agility', 'agility_level', rawGainsByKey.agility),
      tenacity: buildEntry('tenacity', 'tenacity_level', rawGainsByKey.tenacity),
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
