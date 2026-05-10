import pool from '../db/pool';
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

  // `stats` was previously emitted in the response but never read on
  // the client (the dashboard uses `useStats` for pillar values). The
  // field is gone now to save a few hundred bytes per dashboard load
  // and to avoid the misleading impression that this endpoint is the
  // source of truth for stat values.
  const [stats, trainingDaysResult, lastWorkoutResult, target, sessionsThisWeek] =
    await Promise.all([
      statsService.findByUserId(userId),
      pool.query<{ day: string }>(
        `SELECT DISTINCT TO_CHAR(s.date, 'YYYY-MM-DD') AS day
           FROM sessions s
          WHERE s.user_id = $1
            AND s.date >= date_trunc('week', CURRENT_DATE)::date
            AND s.date < (date_trunc('week', CURRENT_DATE) + INTERVAL '1 week')::date
          ORDER BY day ASC`,
        [userId]
      ),
      pool.query<{ days_ago: number | null }>(
        `SELECT CASE
                  WHEN MAX(s.date) IS NULL THEN NULL
                  ELSE (CURRENT_DATE - MAX(s.date))::int
                END AS days_ago
           FROM sessions s
          WHERE s.user_id = $1`,
        [userId]
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
