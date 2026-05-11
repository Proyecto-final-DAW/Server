import pool from '../db/pool';
import { localTodayISO } from '../utils/date';
import {
  countTrainingDaysInWeek,
  getUserWeeklyTarget,
} from './session.service';
import * as statsService from './stats.service';
import { isoWeekMonday, liveStreak } from './streak.service';

type CardsResponse = {
  /**
   * Live-expired streak. Always reflects "what is the user's streak
   * right now?" — if more than one ISO week has passed since the
   * last qualifying week, this is 0 even if the stored row says
   * otherwise. Stored value is repaired on the next session save.
   */
  streak: number | null;
  /** User's weekly training target (`days_per_week` floor). */
  weeklyTarget: number;
  /** Distinct training days in the current ISO week. */
  sessionsThisWeek: number;
  lastWorkoutDaysAgo: number | null;
  trainingDays: string[];
};

export const getCards = async (userId: number): Promise<CardsResponse> => {
  const now = new Date();
  const thisWeekMonday = isoWeekMonday(now);
  const nextWeekMonday = new Date(thisWeekMonday.getTime() + 7 * 86_400_000);
  // Pass local "this week" / "today" through as parameters instead of
  // letting Postgres derive them from `CURRENT_DATE`. The pool pins
  // session TZ to UTC, so `date_trunc('week', CURRENT_DATE)` in SQL
  // resolves to the UTC week boundary and disagreed with the client's
  // local "today" during the [local-midnight, UTC-midnight) window
  // (e.g. Mon 00:30 CEST reads as Sun in UTC, putting today's session
  // in the *previous* ISO week and firing the at-risk warning even
  // though the user trained moments ago). JS-side dates use local
  // getters via `isoWeekMonday`/`localTodayISO`, matching the format
  // the client emits and the DATE values stored in `sessions`.
  const todayStr = localTodayISO(now);
  const mondayStr = thisWeekMonday.toISOString().slice(0, 10);
  const nextStr = nextWeekMonday.toISOString().slice(0, 10);

  // `stats` was previously emitted in the response but never read on
  // the client (the dashboard uses `useStats` for pillar values). The
  // field is gone now to save a few hundred bytes per dashboard load
  // and to avoid the misleading impression that this endpoint is the
  // source of truth for stat values.
  const [
    stats,
    trainingDaysResult,
    lastWorkoutResult,
    target,
    sessionsThisWeek,
  ] = await Promise.all([
    statsService.findByUserId(userId),
    pool.query<{ day: string }>(
      `SELECT DISTINCT TO_CHAR(s.date, 'YYYY-MM-DD') AS day
           FROM sessions s
          WHERE s.user_id = $1
            AND s.date >= $2::date
            AND s.date <  $3::date
          ORDER BY day ASC`,
      [userId, mondayStr, nextStr]
    ),
    pool.query<{ days_ago: number | null }>(
      `SELECT CASE
                  WHEN MAX(s.date) IS NULL THEN NULL
                  ELSE ($2::date - MAX(s.date))::int
                END AS days_ago
           FROM sessions s
          WHERE s.user_id = $1`,
      [userId, todayStr]
    ),
    getUserWeeklyTarget(userId),
    countTrainingDaysInWeek(userId, thisWeekMonday),
  ]);

  // Live-expire: if the stored streak is from more than one ISO week
  // ago AND the user hasn't qualified this week yet, show 0.
  const streak = stats
    ? liveStreak(
        {
          streak: stats.streak ?? 0,
          best_streak: stats.best_streak ?? 0,
          last_session_date: stats.last_session_date
            ? new Date(stats.last_session_date)
            : null,
          last_qualifying_week_monday: stats.last_qualifying_week_monday
            ? new Date(stats.last_qualifying_week_monday)
            : null,
        },
        now
      )
    : 0;

  return {
    streak,
    weeklyTarget: target,
    sessionsThisWeek,
    lastWorkoutDaysAgo: lastWorkoutResult.rows[0]?.days_ago ?? null,
    trainingDays: trainingDaysResult.rows.map((r) => r.day),
  };
};
