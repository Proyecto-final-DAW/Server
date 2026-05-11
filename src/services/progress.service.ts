import pool from '../db/pool';
import { resolveMacroInputs } from '../utils/macroProfile';
import { getExerciseMetaById } from './exercise.service';
import { calculateCalories } from './macros.service';
import { normalizeUserRow } from './user.service';

/**
 * Server-LOCAL `YYYY-MM-DD` from a `Date`. Mirrors the convention used
 * by `localTodayISO()` in diet.service and session.service. UTC-based
 * extraction (`toISOString().slice(0,10)`) is the canonical TZ bug —
 * it shifts late-evening local dates one day back.
 */
const toLocalIsoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface ExerciseMaxEntry {
  date: string;
  max_weight: number;
  reps: number;
}

export interface PerformedExerciseEntry {
  id: string;
  name: string;
}

export interface WeightHistoryOptions {
  limit: number;
  before?: Date;
}

/**
 * Returns weight history sorted chronologically (ascending).
 * `before` (optional) excludes entries on/after that date — useful for cursor paging.
 */
export const getWeightHistory = async (
  userId: number,
  options: WeightHistoryOptions
): Promise<WeightEntry[]> => {
  const params: unknown[] = [userId];
  let whereBefore = '';
  if (options.before) {
    params.push(toLocalIsoDate(options.before));
    whereBefore = ` AND date < $${params.length}`;
  }
  params.push(options.limit);

  const result = await pool.query(
    `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, weight::float AS weight
       FROM weight_logs
      WHERE user_id = $1${whereBefore}
      ORDER BY date ASC, created_at ASC
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
};

/**
 * Registers a new weight entry and keeps `users.weight` in sync
 * so macro recalculations stay coherent. Runs in a transaction.
 */
export const registerWeight = async (
  userId: number,
  weight: number,
  date: Date
): Promise<WeightEntry> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Use server-local date components, not UTC. `toISOString().split('T')[0]`
    // is the canonical bug this codebase fights everywhere else: a user in
    // CEST logging at 01:30 local crosses into the previous UTC day, so the
    // weight ends up stamped one day off. Convention is identical to
    // `localTodayISO()` in diet.service / session.service — server-LOCAL
    // calendar day, no timezone gymnastics.
    const isoDate = toLocalIsoDate(date);

    const inserted = await client.query(
      `INSERT INTO weight_logs (user_id, weight, date)
       VALUES ($1, $2, $3)
       RETURNING TO_CHAR(date, 'YYYY-MM-DD') AS date, weight::float AS weight`,
      [userId, weight, isoDate]
    );

    const updatedUserResult = await client.query(
      `UPDATE users
          SET weight = $1,
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [weight, userId]
    );

    // `pg` returns enum-array columns (`Goal[]`) as the literal Postgres
    // string `'{LOSE_FAT}'` rather than a JS array. Without
    // `normalizeUserRow`, `resolveMacroInputs` does `Array.isArray(goals)`
    // → false → returns null → the macro recalc branch is silently
    // skipped, so logging a 5kg weight change updates `users.weight`
    // but never recomputes daily_calories/protein/etc — the diet
    // drifts out of sync with the real body weight.
    const normalizedUser = normalizeUserRow(updatedUserResult.rows[0]);
    const macroInputs = resolveMacroInputs(normalizedUser);

    if (macroInputs) {
      const macros = calculateCalories(
        macroInputs.weightKg,
        macroInputs.heightCm,
        macroInputs.age,
        macroInputs.sex,
        macroInputs.activityFactor,
        macroInputs.goal
      );

      await client.query(
        `UPDATE users
            SET daily_calories = $1,
                protein_grams  = $2,
                carb_grams     = $3,
                fat_grams      = $4,
                updated_at     = NOW()
          WHERE id = $5`,
        [
          macros.daily_calories,
          macros.protein_grams,
          macros.carb_grams,
          macros.fat_grams,
          userId,
        ]
      );
    }

    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (error) {
    // .catch() so a failing ROLLBACK (connection died, broken socket)
    // doesn't replace the original error — the caller needs to see
    // why the transaction blew up, not why the rollback couldn't run.
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Returns, per training day, the heaviest set logged for a given exercise.
 * Reads from the normalized session tables (sessions ⨝ session_exercises ⨝ exercise_sets).
 * `sessions.date` is a DATE column already in the user's local day, so no timezone math is needed.
 */
export const getExerciseMaxHistory = async (
  userId: number,
  exerciseId: string
): Promise<ExerciseMaxEntry[]> => {
  const result = await pool.query(
    `WITH ranked AS (
       SELECT s.date,
              es.weight::float AS weight,
              es.reps,
              ROW_NUMBER() OVER (
                PARTITION BY s.date
                ORDER BY es.weight DESC, es.reps DESC
              ) AS rn
         FROM sessions s
         JOIN session_exercises se ON se.session_id = s.id
         JOIN exercise_sets es ON es.session_exercise_id = se.id
        WHERE s.user_id = $1
          AND se.exercise_api_id = $2
     )
     SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date,
            weight AS max_weight,
            reps
       FROM ranked
      WHERE rn = 1
      ORDER BY date ASC`,
    [userId, exerciseId]
  );
  return result.rows;
};

// Name-based fallback: legacy `tpl-cat-cow-stretch`-style ids never
// match the catalog and predate the muscleGroup-encoded prefix, so
// they slip past both the prefix and the category checks. The name
// itself still names the move ("Cat-cow stretch", "Moderate-pace
// walk"), so a small keyword list cleans them up reliably.
const STRETCH_NAME_PATTERN =
  /\b(stretch|rotation|mobility|movilidad|yoga|cat[- ]?cow)\b/i;
const CARDIO_NAME_PATTERN = /\b(walk|jog|running|run|cycling|cardio|swim)\b/i;

/**
 * Bodyweight / stretch / cardio entries shouldn't pollute the
 * "Progresion por ejercicio" selector — the chart plots max weight per
 * date and those entries either sit at zero (stretches) or at the
 * user's body mass (bodyweight, server-stamped). Detected by catalog
 * metadata, with extra guards for synthetic template ids that never
 * match the catalog (`tpl-stretch-*` / `tpl-cardio-*`), the cardio
 * synthetic prefix used for the post-workout cardio entry, and a
 * name-based heuristic for legacy synthetic ids that pre-dated the
 * sub-prefix encoding.
 */
const isWeightedExercise = (apiId: string, name: string): boolean => {
  if (apiId.startsWith('cardio:')) return false;
  if (apiId.startsWith('tpl-stretch-')) return false;
  if (apiId.startsWith('tpl-cardio-')) return false;

  // Heuristic on the display name. Catches legacy `tpl-<slug>` ids
  // (no sub-prefix) and any custom-named exercise the user added
  // manually whose name signals stretch/cardio.
  if (STRETCH_NAME_PATTERN.test(name) || CARDIO_NAME_PATTERN.test(name)) {
    return false;
  }

  const meta = getExerciseMetaById(apiId);
  if (meta.category === 'stretching' || meta.category === 'cardio') {
    return false;
  }
  const equipment = meta.equipment.toLowerCase().replace(/\s+/g, '');
  if (equipment === 'bodyonly' || equipment === 'bodyweight') return false;
  return true;
};

/**
 * Returns the distinct exercises the user has logged at least once,
 * filtered to those where tracking max weight makes sense — strength
 * moves with an external load. Two-stage filter:
 *
 *  1. SQL — only exercises whose user has logged at least one set with
 *     `reps > 0`. Stretches save sets with `reps=0` plus a duration,
 *     so they're excluded here; cardio entries (no sets at all) are
 *     also excluded by the EXISTS clause. This catches the legacy
 *     `tpl-cat-cow-stretch` style ids that the catalog can't classify.
 *  2. TS — `isWeightedExercise` removes bodyweight entries (real reps,
 *     but the "weight" is the user's body mass stamped server-side) so
 *     they don't drown out the actual PR-tracking exercises.
 */
export const getPerformedExercises = async (
  userId: number
): Promise<PerformedExerciseEntry[]> => {
  const result = await pool.query<PerformedExerciseEntry>(
    `SELECT id, name
       FROM (
         SELECT DISTINCT ON (se.exercise_api_id)
                se.exercise_api_id AS id,
                se.name,
                s.date AS last_date
           FROM session_exercises se
           JOIN sessions s ON s.id = se.session_id
          WHERE s.user_id = $1
            AND EXISTS (
              SELECT 1
                FROM exercise_sets es
               WHERE es.session_exercise_id = se.id
                 AND es.reps > 0
            )
          ORDER BY se.exercise_api_id, s.date DESC, s.id DESC
       ) latest
      ORDER BY last_date DESC, id ASC`,
    [userId]
  );
  return result.rows.filter((row) => isWeightedExercise(row.id, row.name));
};
