import pool from '../db/pool';
import type { UnlockedMilestone } from '../models/Milestone';
import { SessionExercise } from '../models/Session';
import * as milestoneService from './milestone.service';
import { applyGains, calculateGains } from './progression.service';
import * as statsService from './stats.service';

const countUserSessions = async (userId: number): Promise<number> => {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].total;
};

const getTotalWeightLifted = async (userId: number): Promise<number> => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(
       (elem->>'weight')::numeric * (elem->>'reps')::int * (elem->>'sets')::int
     ), 0)::int AS total
     FROM sessions, jsonb_array_elements(exercises::jsonb) AS elem
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0].total;
};

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

  // Check milestones — secondary, must not block the session
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
  } catch {
    // Milestone check failed — session and stats are already saved
  }

  return { session, stats: updatedStats, newMilestones };
};
