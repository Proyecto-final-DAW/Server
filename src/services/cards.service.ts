import pool from '../db/pool';
import * as statsService from './stats.service';

type CardsResponse = {
  streak: number | null;
  lastWorkoutDaysAgo: number | null;
  trainingDays: string[];
  stats: {
    strength: number;
    resistance: number;
    stamina: number;
    agility: number;
    tenacity: number;
    vigor: number;
  };
};

export const getCards = async (userId: number): Promise<CardsResponse> => {
  const [stats, trainingDaysResult, lastWorkoutResult] = await Promise.all([
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
  ]);

  return {
    streak: stats?.streak ?? null,
    lastWorkoutDaysAgo: lastWorkoutResult.rows[0]?.days_ago ?? null,
    trainingDays: trainingDaysResult.rows.map((r) => r.day),
    stats: {
      strength: stats?.strength ?? 0,
      resistance: stats?.endurance ?? 0,
      stamina: stats?.stamina ?? 0,
      agility: stats?.agility ?? 0,
      tenacity: stats?.tenacity ?? 0,
      vigor: stats?.vigor ?? 0,
    },
  };
};
