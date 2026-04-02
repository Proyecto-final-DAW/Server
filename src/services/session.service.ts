import pool from '../db/pool';
import { SessionExercise } from '../models/Session';
import { applyGains, calculateGains } from './progression.service';
import * as statsService from './stats.service';

export const createSession = async (
  userId: number,
  exercises: SessionExercise[]
) => {
  const result = await pool.query(
    `INSERT INTO sessions (user_id, exercises) VALUES ($1, $2) RETURNING *`,
    [userId, JSON.stringify(exercises)]
  );
  return result.rows[0];
};

/**
 * Processes a new training session:
 * 1. Saves the session to DB
 * 2. Calculates XP gains from exercises
 * 3. Applies gains to user stats (with level-up handling)
 * 4. Updates streak tracking
 */
export const processSession = async (
  userId: number,
  exercises: SessionExercise[]
) => {
  const currentStats = await statsService.findByUserId(userId);
  if (!currentStats) {
    const error = new Error('Stats not initialized');
    (error as Error & { code: string }).code = 'STATS_NOT_FOUND';
    throw error;
  }

  const session = await createSession(userId, exercises);

  const gains = calculateGains(exercises);
  const statUpdates = applyGains(currentStats, gains);

  // Update streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = currentStats.last_session_date
    ? new Date(currentStats.last_session_date)
    : null;
  if (lastDate) lastDate.setHours(0, 0, 0, 0);

  const diffDays = lastDate
    ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
    : -1;

  let streak = currentStats.streak;
  if (diffDays === 1) {
    streak += 1;
  } else if (diffDays !== 0) {
    streak = 1;
  }

  const bestStreak = Math.max(currentStats.best_streak, streak);

  // Tenacity gains from session consistency
  const tenacityXp = currentStats.tenacity + 5;
  let tenacityLevel = currentStats.tenacity_level;
  let tenacityFinal = tenacityXp;
  while (tenacityFinal >= 100) {
    tenacityFinal -= 100;
    tenacityLevel += 1;
  }

  const updatedStats = await statsService.updateStats(userId, {
    ...statUpdates,
    tenacity: tenacityFinal,
    tenacity_level: tenacityLevel,
    streak,
    best_streak: bestStreak,
    last_session_date: today.toISOString().split('T')[0],
  });

  return { session, stats: updatedStats };
};
