import pool from '../db/pool';
import { resolveMacroInputs } from '../utils/macroProfile';
import { calculateCalories, MacroTargets } from './macros.service';
import { applyXpToLevel } from './progression.service';
import { normalizeUserRow } from './user.service';

/**
 * XP awarded directly to the vigor pillar when the user marks today's
 * diet as completed. Decoupled from session XP — the user expected
 * immediate feedback on the button press, and so eating well counts
 * even on rest days.
 *
 * Training is still the heavier vigor source (+20 in session.service),
 * so a 30-cap day requires both. A diet-only week (no sessions) caps
 * at 70 XP, slow but visible — exactly what "vives bien sin entrenar"
 * should feel like.
 */
const DIET_VIGOR_GAIN = 10;

function throwCoded(message: string, code: string): never {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  throw err;
}

/**
 * Returns the user's current macro targets.
 *
 * Recalculates with Mifflin–St Jeor whenever the stored daily_calories /
 * protein / fat / carbs drift from what the current weight, goal, and other
 * profile inputs imply — keeping the diet in sync without a separate
 * "recalc" endpoint.
 *
 * Throws ONBOARDING_INCOMPLETE if the user hasn't finished onboarding
 * or is missing any macro input.
 */
export async function getCurrentMacros(userId: number): Promise<MacroTargets> {
  // `birth_date` (not `age`) is what resolveMacroInputs reads to compute
  // the Mifflin–St Jeor age input — selecting only `age` made every diet
  // request 404 with ONBOARDING_INCOMPLETE because birth_date came back
  // as undefined.
  const result = await pool.query(
    `SELECT onboarding_completed, weight, height, birth_date, sex, activity_level, goals,
            daily_calories, protein_grams, fat_grams, carb_grams
       FROM users WHERE id = $1`,
    [userId]
  );

  const rawUser = result.rows[0];
  if (!rawUser) {
    throwCoded('USER_NOT_FOUND', 'USER_NOT_FOUND');
  }

  // Normalize Postgres enum-array columns (goals, injuries, equipment) into
  // JS arrays. Without this, `Array.isArray(user.goals)` in resolveMacroInputs
  // would fail and every diet request would 404 with ONBOARDING_INCOMPLETE.
  const user = normalizeUserRow(rawUser);

  const inputs = user.onboarding_completed ? resolveMacroInputs(user) : null;
  if (!inputs) {
    throwCoded('ONBOARDING_INCOMPLETE', 'ONBOARDING_INCOMPLETE');
  }

  const computed = calculateCalories(
    inputs.weightKg,
    inputs.heightCm,
    inputs.age,
    inputs.sex,
    inputs.activityFactor,
    inputs.goal
  );

  const drifted =
    user.daily_calories !== computed.daily_calories ||
    user.protein_grams !== computed.protein_grams ||
    user.fat_grams !== computed.fat_grams ||
    user.carb_grams !== computed.carb_grams;

  if (drifted) {
    // Lock the user row before writing the recomputed macros so a
    // concurrent profile update can't slip in between this read and
    // the persist, which would re-overwrite the freshly-saved profile
    // with stale-input macros. Read-mostly path that occasionally
    // writes — the cost of a brief row lock is acceptable for the
    // correctness guarantee.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [
        userId,
      ]);
      await client.query(
        `UPDATE users
            SET daily_calories = $1, protein_grams = $2, fat_grams = $3, carb_grams = $4,
                updated_at = NOW()
          WHERE id = $5`,
        [
          computed.daily_calories,
          computed.protein_grams,
          computed.fat_grams,
          computed.carb_grams,
          userId,
        ]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return computed;
}

/**
 * Daily diet-log streak — lives parallel to the (now weekly) training
 * streak. Diet is a daily habit, so the streak resets on a single
 * missed day. Mirrors the original day-based training streak logic.
 *
 * Rules:
 *   - No previous log              → diet_streak = 1
 *   - Same day                     → no change (one log per day max)
 *   - Consecutive day (gap = 1)    → diet_streak + 1
 *   - Gap > 1 day                  → diet_streak = 1 (reset)
 *   - best_diet_streak = max(best, new streak)
 */

/**
 * Diet state. `last_diet_date` is the raw YYYY-MM-DD string from
 * Postgres (we cast `date::text` in queries) — *not* a JS Date.
 *
 * The previous version returned a Date here, but the `pg` driver
 * parses `date` columns into a JS Date at *local* midnight and our
 * comparison helpers used UTC getters; in any TZ ahead of UTC (e.g.
 * CEST), that round-trip silently shifted the stored date one day
 * back, so `isDietLoggedToday` returned `false` immediately after a
 * log and the COMPLETAR-DIETA button reset to "not logged" the next
 * time the user opened the diet view. Working on the raw string
 * eliminates the entire Date/TZ pipeline.
 */
export interface DietState {
  diet_streak: number;
  best_diet_streak: number;
  last_diet_date: string | null;
}

export interface DietLogResult {
  diet_streak: number;
  best_diet_streak: number;
  last_diet_date: string;
  alreadyLoggedToday: boolean;
  /**
   * Vigor pillar XP movement caused by this log. Zero-delta when the
   * call was a no-op (already logged today or capped at MAX_STAT_LEVEL),
   * so the client can decide whether to show the stat-up popup based
   * on `alreadyLoggedToday` alone.
   */
  vigor_before_xp: number;
  vigor_before_level: number;
  vigor_after_xp: number;
  vigor_after_level: number;
  vigor_delta: number;
}

/**
 * Local-timezone YYYY-MM-DD string — matches the user's perceived
 * "today" rather than UTC. Server is colocated with the user in dev;
 * for prod, pinning server TZ to UTC and having the client send UTC
 * keeps this consistent without timezone gymnastics.
 */
const localTodayISO = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Difference in days between two YYYY-MM-DD strings. Builds Dates at
 * local midnight (matching what `localTodayISO` produces) so the
 * subtraction is exact: no DST/UTC drift because both sides come from
 * the same constructor in the same timezone.
 */
const diffInDays = (a: string, b: string): number => {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aMs = new Date(ay, am - 1, ad).getTime();
  const bMs = new Date(by, bm - 1, bd).getTime();
  return Math.floor((aMs - bMs) / 86_400_000);
};

interface NextDietStreak {
  diet_streak: number;
  best_diet_streak: number;
  last_diet_date: string;
  alreadyLoggedToday: boolean;
}

const calculateNextDietState = (
  current: DietState,
  todayStr: string
): NextDietStreak => {
  if (!current.last_diet_date) {
    return {
      diet_streak: 1,
      best_diet_streak: Math.max(current.best_diet_streak, 1),
      last_diet_date: todayStr,
      alreadyLoggedToday: false,
    };
  }

  const dayGap = diffInDays(todayStr, current.last_diet_date);

  if (dayGap === 0) {
    return {
      diet_streak: current.diet_streak,
      best_diet_streak: current.best_diet_streak,
      last_diet_date: current.last_diet_date,
      alreadyLoggedToday: true,
    };
  }

  if (dayGap === 1) {
    const next = current.diet_streak + 1;
    return {
      diet_streak: next,
      best_diet_streak: Math.max(current.best_diet_streak, next),
      last_diet_date: todayStr,
      alreadyLoggedToday: false,
    };
  }

  // Gap > 1 day → reset.
  return {
    diet_streak: 1,
    best_diet_streak: Math.max(current.best_diet_streak, 1),
    last_diet_date: todayStr,
    alreadyLoggedToday: false,
  };
};

/**
 * Atomically logs today's diet for the user and updates the daily
 * streak. Uses SELECT … FOR UPDATE so two simultaneous taps from a
 * device + tab don't race each other into a doubled streak.
 *
 * Returns null when the user has no stats row yet (shouldn't happen
 * post-onboarding, but lets the controller surface a clean 404).
 */
export async function logDietForToday(
  userId: number,
  today: Date = new Date()
): Promise<DietLogResult | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // `last_diet_date::text` forces Postgres to emit a YYYY-MM-DD
    // string instead of letting node-pg parse it into a local-midnight
    // Date — see the DietState comment for why that mattered.
    const { rows } = await client.query<{
      diet_streak: number;
      best_diet_streak: number;
      last_diet_date: string | null;
      vigor: number;
      vigor_level: number;
    }>(
      `SELECT diet_streak, best_diet_streak, last_diet_date::text AS last_diet_date,
              vigor, vigor_level
         FROM stats
        WHERE user_id = $1
        FOR UPDATE`,
      [userId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = rows[0];
    const todayStr = localTodayISO(today);
    const next = calculateNextDietState(current, todayStr);

    let nextVigorXp = current.vigor;
    let nextVigorLevel = current.vigor_level;

    if (!next.alreadyLoggedToday) {
      // Apply the direct vigor reward through the same applyXpToLevel
      // helper as session XP so MAX_STAT_LEVEL is respected and the
      // level-up math is consistent. Re-using that helper means a
      // diet log can level vigor up exactly like a workout would.
      const applied = applyXpToLevel(
        current.vigor_level,
        current.vigor + DIET_VIGOR_GAIN
      );
      nextVigorXp = applied.xp;
      nextVigorLevel = applied.level;

      await client.query(
        `UPDATE stats
            SET diet_streak = $1,
                best_diet_streak = $2,
                last_diet_date = $3,
                vigor = $4,
                vigor_level = $5,
                updated_at = NOW()
          WHERE user_id = $6`,
        [
          next.diet_streak,
          next.best_diet_streak,
          next.last_diet_date,
          nextVigorXp,
          nextVigorLevel,
          userId,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      ...next,
      vigor_before_xp: current.vigor,
      vigor_before_level: current.vigor_level,
      vigor_after_xp: nextVigorXp,
      vigor_after_level: nextVigorLevel,
      vigor_delta: next.alreadyLoggedToday ? 0 : DIET_VIGOR_GAIN,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read-only fetch of the user's diet streak state. Used by the diet
 * view to render the button (✓ DIETA HOY vs ✓ REGISTRADO HOY) and the
 * current streak chip without going through the log endpoint.
 */
export async function getDietState(
  userId: number
): Promise<DietState | null> {
  const result = await pool.query<{
    diet_streak: number;
    best_diet_streak: number;
    last_diet_date: string | null;
  }>(
    `SELECT diet_streak, best_diet_streak, last_diet_date::text AS last_diet_date
       FROM stats
      WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

/**
 * True iff the user logged their diet today. Cheap derived check
 * exposed so session.service can apply the +18 vigor bonus without
 * pulling the full state object.
 */
export async function isDietLoggedToday(
  userId: number,
  today: Date = new Date()
): Promise<boolean> {
  const state = await getDietState(userId);
  if (!state || !state.last_diet_date) return false;
  return state.last_diet_date === localTodayISO(today);
}
