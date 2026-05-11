/**
 * streak.service.ts — Weekly training streak.
 *
 * A "streak" is the number of consecutive ISO weeks in which the user
 * trained at least once. The first session of a week qualifies that
 * week; subsequent sessions that week don't move the streak further.
 *
 * Why ≥1 session and not the user's `days_per_week` target: requiring
 * the full target left a brand-new user with target=3 staring at a 0
 * streak after their *first* gym day, and any user who registered
 * mid-week saw their first week fail to count because they hadn't hit
 * the target by Sunday. The target still matters — it powers the
 * "X / Y esta semana" progress hint and the at-risk warning — but it
 * no longer gates the streak itself. The streak is the "I keep showing
 * up" signal; the target is the "and ideally this often" goal.
 *
 * Source of truth:
 *   - `last_qualifying_week_monday`: ISO Monday (UTC) of the most
 *     recent qualifying week. NULL until the first target-hit ever.
 *   - `streak`: count of consecutive qualifying weeks ending at that
 *     Monday. Stored, not recomputed, but live-expired on read when
 *     more than 1 ISO week has elapsed since the last qualifying week.
 *
 * Why store and live-expire instead of recompute every read:
 *   - Cheap: no SQL aggregation per dashboard load.
 *   - Correct: a stale value is repaired on the next session save
 *     (which is the only event that can extend a streak).
 */

export interface StreakState {
  streak: number;
  best_streak: number;
  last_session_date: Date | null;
  /** ISO Monday of the most recent qualifying week (NULL if never). */
  last_qualifying_week_monday: Date | null;
}

export interface StreakInputs {
  current: StreakState;
  /** User's weekly training target (sessions). At least 1. */
  target: number;
  /**
   * Sessions in the ISO week of `sessionDate`, INCLUDING this save.
   * Used to detect "this session just hit the target".
   */
  sessionsThisWeek: number;
  /**
   * Sessions in the ISO week immediately before `sessionDate`'s week.
   * Used to decide whether the previous week qualifies — required to
   * know if the streak extends or resets when the target is hit.
   */
  sessionsLastWeek: number;
  sessionDate: Date;
}

export interface StreakResult {
  streak: number;
  best_streak: number;
  last_session_date: string;
  last_qualifying_week_monday: string;
  changed: boolean;
}

/**
 * Monday 00:00 (anchored at UTC for cheap arithmetic) of the ISO week
 * that contains the LOCAL date of `date`.
 *
 * Why local getters and not `getUTC*`: the rest of the date pipeline is
 * local — `localTodayISO()` formats the server's local YYYY-MM-DD, the
 * client sends `toISODate(new Date())` (also local), and sessions are
 * stored as DATE columns whose semantics are "the calendar day the user
 * trained". Reading UTC components off `new Date()` in any TZ ahead of
 * UTC silently shifts the answer one ISO week back during the window
 * between local midnight and UTC midnight — e.g. Monday 00:30 CEST
 * reads as Sunday 22:30 UTC and returns the PREVIOUS week's Monday,
 * which then excludes today's session from `[weekMonday, weekEnd)` and
 * fires the at-risk warning even though the user just trained.
 *
 * The returned Date is still a UTC-midnight instant of the resolved
 * Monday so `weekMonday.getTime() + 7 * 86_400_000` arithmetic stays
 * DST-safe (no offset jumps mid-week).
 */
export const isoWeekMonday = (date: Date): Date => {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayMonFirst = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - (dayMonFirst - 1));
  return utc;
};

/**
 * Whole ISO weeks between two dates (later − earlier). Comparing
 * Mondays sidesteps DST + year-boundary edge cases that you'd hit
 * counting raw days/7.
 */
const diffInWeeks = (later: Date, earlier: Date): number => {
  const ms = isoWeekMonday(later).getTime() - isoWeekMonday(earlier).getTime();
  return Math.round(ms / (7 * 86_400_000));
};

/**
 * YYYY-MM-DD for Dates produced by `isoWeekMonday()` — i.e. UTC midnight
 * of the resolved Monday. UTC getters are correct here because the value
 * was constructed via `Date.UTC(...)` and uses UTC midnight as the
 * canonical anchor for DST-safe week arithmetic. The local-midnight
 * Date that `parseLocalDay()` returns must be formatted separately
 * (`fromLocalMidnight()` below) — using UTC getters on that would shift
 * the day back one in any TZ ahead of UTC, which is the original
 * `last_session_date` off-by-one bug.
 */
const fromUtcMidnight = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * YYYY-MM-DD for Dates produced by `parseLocalDay()` — i.e. local
 * midnight on the calendar day the user is in. Local getters keep the
 * day calendar-stable across timezones; `toISOString()` would reroute
 * through UTC and silently move the date one day in either direction
 * depending on the user's offset.
 */
const fromLocalMidnight = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Computes the next streak state given a session save. Pure function:
 * the caller is responsible for fetching `sessionsThisWeek` (and
 * historically `sessionsLastWeek`, kept in the input shape for API
 * compatibility but no longer used by the simplified model).
 *
 * Cases (with the "≥1 session per week qualifies" model):
 *   - This is the first session of the ISO week (sessionsThisWeek===1):
 *       - First qualifying week ever            → streak = 1.
 *       - Previous ISO week also qualified      → streak += 1.
 *       - Otherwise (gap of ≥1 missed week)     → streak = 1 (reset).
 *   - This is a bonus session that week (sessionsThisWeek > 1)
 *     → no streak change (week already qualified earlier).
 *   - Backdated session in an ISO week older than the last qualifying
 *     week → no streak change (we don't rewrite history).
 */
export const calculateStreak = (inputs: StreakInputs): StreakResult => {
  const { current, sessionsThisWeek, sessionDate } = inputs;

  const sessionWeekMonday = isoWeekMonday(sessionDate);
  // `sessionDate` is local-midnight (built by `parseLocalDay()` from a
  // local YYYY-MM-DD), so format it with local getters — UTC-based
  // formatting was the source of the off-by-one in `last_session_date`
  // for sessions saved in the early hours of the local day.
  const sessionDateStr = fromLocalMidnight(sessionDate);
  // `sessionWeekMonday` and `last_qualifying_week_monday` are
  // UTC-midnight Dates (anchored that way for DST-safe arithmetic), so
  // format them with UTC getters.
  const sessionWeekMondayStr = fromUtcMidnight(sessionWeekMonday);
  const lastQualifyingStr = current.last_qualifying_week_monday
    ? fromUtcMidnight(current.last_qualifying_week_monday)
    : '';

  // Bonus session in an already-qualified week — week's already in
  // the streak, no change.
  if (sessionsThisWeek > 1) {
    return {
      streak: current.streak,
      best_streak: current.best_streak,
      last_session_date: sessionDateStr,
      last_qualifying_week_monday: lastQualifyingStr,
      changed: true, // last_session_date refreshed
    };
  }

  // sessionsThisWeek === 1 → this session is what qualifies the week.

  // Backdate: qualifying session in a week older than the last
  // qualifying week. Don't rewrite older streak entries.
  if (
    current.last_qualifying_week_monday &&
    sessionWeekMonday.getTime() < current.last_qualifying_week_monday.getTime()
  ) {
    return {
      streak: current.streak,
      best_streak: current.best_streak,
      last_session_date: sessionDateStr,
      last_qualifying_week_monday: lastQualifyingStr,
      changed: true,
    };
  }

  // First qualifying week ever — covers the brand-new user case.
  if (!current.last_qualifying_week_monday) {
    return {
      streak: 1,
      best_streak: Math.max(current.best_streak, 1),
      last_session_date: sessionDateStr,
      last_qualifying_week_monday: sessionWeekMondayStr,
      changed: true,
    };
  }

  const weeksSinceLastQualifying = diffInWeeks(
    sessionWeekMonday,
    current.last_qualifying_week_monday
  );

  // Same week as last qualifying — defensive (sessionsThisWeek=1
  // implies no prior qualifying session this week, but if dates get
  // weird we don't want to double-count).
  if (weeksSinceLastQualifying === 0) {
    return {
      streak: current.streak,
      best_streak: current.best_streak,
      last_session_date: sessionDateStr,
      last_qualifying_week_monday: lastQualifyingStr,
      changed: true,
    };
  }

  // Consecutive ISO week → extend the streak.
  if (weeksSinceLastQualifying === 1) {
    const next = current.streak + 1;
    return {
      streak: next,
      best_streak: Math.max(current.best_streak, next),
      last_session_date: sessionDateStr,
      last_qualifying_week_monday: sessionWeekMondayStr,
      changed: true,
    };
  }

  // Gap of ≥2 weeks since last qualifying week → reset to 1.
  // (Unlike the previous model there's no "saved-without-recording"
  // edge case to honour: under ≥1-session qualification, every week
  // with any session is recorded, so a gap is a real gap.)
  return {
    streak: 1,
    best_streak: Math.max(current.best_streak, 1),
    last_session_date: sessionDateStr,
    last_qualifying_week_monday: sessionWeekMondayStr,
    changed: true,
  };
};

/**
 * Live-expire helper. Returns the streak the user effectively has
 * *right now* — zero if more than one ISO week has elapsed since the
 * last qualifying week (qualification = at least one session, matching
 * `calculateStreak`).
 *
 * Reads are passive: the streak number only grows inside
 * `processSession`, which writes back the new value. The previous
 * version added a speculative `+1` when the current week had ≥1
 * session but `last_qualifying_week_monday` was still last week's
 * Monday. That diverged from `best_streak` (also persisted only on
 * save) and made the dashboard show a higher number than the profile.
 * Trust the stored value here; let the save path keep it current.
 *
 * The earlier signature carried `target` and `sessionsThisWeek`
 * placeholders kept "for compatibility" — both call sites have been
 * updated, so they're gone now.
 */
export const liveStreak = (
  state: StreakState,
  now: Date = new Date()
): number => {
  if (state.streak <= 0 || !state.last_qualifying_week_monday) return 0;

  const weeksSince = diffInWeeks(now, state.last_qualifying_week_monday);

  // Alive: this week or last week (a one-week gap is still "in time"
  // because the user has until Sunday to qualify and resurrect it).
  if (weeksSince <= 1) return state.streak;

  // Gap > 1 ISO week → streak is dead, regardless of stored value.
  return 0;
};

export interface StreakStatus {
  currentStreak: number;
  /** Sessions completed in the current ISO week. */
  sessionsThisWeek: number;
  /** Sessions still needed this week to qualify. 0 if already met. */
  sessionsRemaining: number;
  /** Hours until the current ISO week ends (Sunday 23:59 UTC). */
  hoursRemaining: number;
  /**
   * True iff the user has an active streak that could be lost this
   * week and the runway (days × theoretical sessions/day) is tight.
   */
  isAtRisk: boolean;
  target: number;
}

/**
 * Building block for the dashboard "RACHA EN PELIGRO" warning.
 *
 * Under the ≥1-session-per-week qualification model the streak is
 * safe the moment the user trains once this ISO week. So the warning
 * fires only when:
 *   - The user has an active streak (`live > 0`), AND
 *   - They haven't trained yet this week (`sessionsThisWeek === 0`).
 *
 * The previous version compared `daysRemaining` against
 * `target - sessionsThisWeek`, which was correct under the old "must
 * hit target" model but mis-fired under the current one — a user with
 * 1 session done and target 5 was flagged as "in danger of losing the
 * streak" even though the week was already qualified.
 *
 * `sessionsRemaining` is still surfaced so the dashboard can show the
 * weekly target progress separately ("X / Y esta semana") without
 * conflating it with streak survival.
 */
export const calculateStreakStatus = (
  state: StreakState,
  target: number,
  sessionsThisWeek: number,
  now: Date = new Date()
): StreakStatus => {
  const live = liveStreak(state, now);
  const sessionsRemaining = Math.max(0, target - sessionsThisWeek);

  const monday = isoWeekMonday(now);
  const endOfWeek = new Date(monday.getTime() + 7 * 86_400_000);
  const hoursRemaining = Math.max(
    0,
    Math.ceil((endOfWeek.getTime() - now.getTime()) / 3_600_000)
  );

  // Streak alive AND no session yet this week → the only state where
  // missing the rest of the week actually breaks the streak.
  const isAtRisk = live > 0 && sessionsThisWeek === 0;

  return {
    currentStreak: live,
    sessionsThisWeek,
    sessionsRemaining,
    hoursRemaining,
    isAtRisk,
    target,
  };
};
