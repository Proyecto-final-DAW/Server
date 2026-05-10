import pool from '../db/pool';
import type {
  CardioIntensity,
  CreateSessionExerciseInput,
  ExerciseType,
} from '../models/Session';
import { applyXpToLevel, calculateGains } from './progression.service';

export const createStats = async (userId: number) => {
  const result = await pool.query(
    'INSERT INTO stats (user_id) VALUES ($1) RETURNING *',
    [userId]
  );
  return result.rows[0];
};

export const findByUserId = async (userId: number) => {
  // Cast date columns to text so the wire shape is the calendar string
  // ('2026-05-09') instead of the ISO timestamp `pg` would otherwise
  // produce ('2026-05-09T00:00:00.000Z'). `diet.service.getDietState`
  // already does this for `last_diet_date`; mirroring it here keeps
  // the same column consistent across endpoints — without the cast
  // the streak === localTodayISO() comparison on the client never
  // matches when the value is sourced from /users/stats vs /diet/state.
  const result = await pool.query(
    `SELECT
        *,
        last_session_date::text AS last_session_date,
        last_qualifying_week_monday::text AS last_qualifying_week_monday,
        last_diet_date::text AS last_diet_date
       FROM stats
      WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
};

/** Whitelist of columns `updateStats` is allowed to write. Without
 *  this any caller (controllers, services) interpolating raw object
 *  keys into the SQL `SET` fragment would let an attacker who can
 *  control the input shape write arbitrary columns or inject SQL
 *  fragments. Defensive — current callers all filter, but the
 *  allowlist makes the property a service-level invariant. */
const WRITABLE_STAT_COLUMNS = new Set<string>([
  'strength',
  'strength_level',
  'endurance',
  'endurance_level',
  'stamina',
  'stamina_level',
  'agility',
  'agility_level',
  'tenacity',
  'tenacity_level',
  'vigor',
  'vigor_level',
  'streak',
  'best_streak',
  'last_session_date',
  'last_qualifying_week_monday',
  'diet_streak',
  'best_diet_streak',
  'last_diet_date',
]);

/**
 * Internal helper. Same UPDATE as `updateStats` but runs against a
 * caller-managed `pg` client — used by `processSession` so the stats
 * write happens in the same transaction as the SELECT FOR UPDATE
 * that locked the row, closing the lost-update race two concurrent
 * saves used to expose.
 */
export const updateStatsInTx = async (
  client: import('pg').PoolClient,
  userId: number,
  data: Record<string, unknown>
) => {
  const allowedEntries = Object.entries(data).filter(
    ([key]) => WRITABLE_STAT_COLUMNS.has(key)
  );
  if (allowedEntries.length === 0) {
    const fallback = await client.query(
      `SELECT * FROM stats WHERE user_id = $1`,
      [userId]
    );
    return fallback.rows[0];
  }
  const fields = allowedEntries.map(([k]) => k);
  const values = allowedEntries.map(([, v]) => v);

  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

  const result = await client.query(
    `UPDATE stats SET ${setClause}, updated_at = NOW() WHERE user_id = $${fields.length + 1} RETURNING *`,
    [...values, userId]
  );
  return result.rows[0];
};

export const updateStats = async (
  userId: number,
  data: Record<string, unknown>
) => {
  const allowedEntries = Object.entries(data).filter(
    ([key]) => WRITABLE_STAT_COLUMNS.has(key)
  );
  if (allowedEntries.length === 0) {
    return findByUserId(userId);
  }
  const fields = allowedEntries.map(([k]) => k);
  const values = allowedEntries.map(([, v]) => v);

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
 * Per-session level snapshot. Replayed from the session table so the
 * curve is deterministic; tenacidad and vigor follow streak/diet rules
 * whose state would have to be simulated, so they're frozen at level 1
 * in the replay — the radar uses the snapshot for the four effort
 * pillars and falls back to the live values for tenacidad/vigor.
 */
export interface StatHistoryPoint {
  date: string;
  strength_level: number;
  endurance_level: number;
  stamina_level: number;
  agility_level: number;
}

interface RawHistoryRow {
  session_id: number;
  date: string;
  exercise_id: number;
  exercise_api_id: string;
  name: string;
  type: ExerciseType;
  duration_minutes: number | null;
  intensity: CardioIntensity | null;
  set_reps: number | null;
  set_weight: string | null;
  set_duration_seconds: number | null;
}

const replayLevels = (
  sessionsInOrder: CreateSessionExerciseInput[][]
): Omit<StatHistoryPoint, 'date'>[] => {
  const mutable: Record<
    'strength' | 'endurance' | 'stamina' | 'agility',
    { xp: number; level: number }
  > = {
    strength: { xp: 0, level: 1 },
    endurance: { xp: 0, level: 1 },
    stamina: { xp: 0, level: 1 },
    agility: { xp: 0, level: 1 },
  };

  return sessionsInOrder.map((exercises) => {
    const gains = calculateGains(exercises);
    (['strength', 'endurance', 'stamina', 'agility'] as const).forEach(
      (key) => {
        const gain = gains.get(key);
        if (!gain) return;
        const next = applyXpToLevel(
          mutable[key].level,
          mutable[key].xp + gain.xp
        );
        mutable[key] = next;
      }
    );
    return {
      strength_level: mutable.strength.level,
      endurance_level: mutable.endurance.level,
      stamina_level: mutable.stamina.level,
      agility_level: mutable.agility.level,
    };
  });
};

/**
 * Returns the user's per-session level snapshots in chronological
 * order. Used by the /progress radar's time selector to show how the
 * silhouette looked at past points in time.
 */
export const getStatHistory = async (
  userId: number,
  limit = 200
): Promise<StatHistoryPoint[]> => {
  // Two-step query — the previous "LIMIT (limit * 50) joined rows"
  // approach silently truncated the timeline whenever a single
  // session had more than 50 sets, because the row cap could be hit
  // mid-session and partial sets would feed into the JS replay with
  // missing volume. Now we pick the N most-recent sessions first
  // (by id), then fetch ALL their joined sets without a row cap.
  // Ordered ascending after the slice so the replay walks chronology
  // forward, same as before.
  const sessionResult = await pool.query<{ id: number; date: string }>(
    `SELECT id, date::text AS date
       FROM sessions
      WHERE user_id = $1
      ORDER BY date DESC, id DESC
      LIMIT $2`,
    [userId, limit]
  );
  if (sessionResult.rows.length === 0) return [];
  const sessionIds = sessionResult.rows.map((r) => r.id);

  const result = await pool.query<RawHistoryRow>(
    `SELECT s.id          AS session_id,
            s.date::text  AS date,
            se.id         AS exercise_id,
            se.exercise_api_id,
            se.name,
            se.type,
            se.duration_minutes,
            se.intensity,
            es.reps                  AS set_reps,
            es.weight::numeric::text AS set_weight,
            es.duration_seconds      AS set_duration_seconds
       FROM sessions s
       JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN exercise_sets es ON es.session_exercise_id = se.id
      WHERE s.id = ANY($1::int[])
      ORDER BY s.date ASC, s.id ASC, se.order_index ASC, es.order_index ASC`,
    [sessionIds]
  );

  const sessionsMap = new Map<
    number,
    { date: string; exercises: Map<number, CreateSessionExerciseInput> }
  >();
  const sessionOrder: number[] = [];

  for (const row of result.rows) {
    if (!sessionsMap.has(row.session_id)) {
      sessionsMap.set(row.session_id, {
        date: row.date,
        exercises: new Map(),
      });
      sessionOrder.push(row.session_id);
    }
    const session = sessionsMap.get(row.session_id)!;
    if (!session.exercises.has(row.exercise_id)) {
      session.exercises.set(row.exercise_id, {
        exercise_api_id: row.exercise_api_id,
        name: row.name,
        type: row.type,
        sets: [],
        ...(row.duration_minutes !== null
          ? { duration_minutes: row.duration_minutes }
          : {}),
        ...(row.intensity !== null ? { intensity: row.intensity } : {}),
      });
    }
    const exercise = session.exercises.get(row.exercise_id)!;
    if (row.set_reps !== null && row.set_weight !== null) {
      exercise.sets.push({
        reps: row.set_reps,
        weight: parseFloat(row.set_weight),
        duration_seconds: row.set_duration_seconds,
      });
    }
  }

  const sessionsInOrder: CreateSessionExerciseInput[][] = sessionOrder.map(
    (id) => Array.from(sessionsMap.get(id)!.exercises.values())
  );
  const dates = sessionOrder.map((id) => sessionsMap.get(id)!.date);

  const snapshots = replayLevels(sessionsInOrder);
  return snapshots.map((snap, i) => ({ date: dates[i], ...snap }));
};

