/**
 * streak.service.ts — Pure streak calculation logic
 *
 * Rules:
 *   - No previous session          → streak = 1
 *   - Same day (diff = 0)          → no change
 *   - Consecutive day (diff = 1)   → streak + 1
 *   - Gap > 1 day                  → streak = 1 (reset)
 *   - best_streak = max(best_streak, new streak)
 */

export interface StreakState {
  streak: number;
  best_streak: number;
  last_session_date: Date | null;
}

export interface StreakResult {
  streak: number;
  best_streak: number;
  last_session_date: string; // ISO date string (YYYY-MM-DD)
  changed: boolean;
}

function toDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function diffInDays(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.floor(
    (toDateOnly(a).getTime() - toDateOnly(b).getTime()) / msPerDay
  );
}

export function calculateStreak(
  current: StreakState,
  sessionDate: Date = new Date()
): StreakResult {
  const sessionDateStr = sessionDate.toISOString().slice(0, 10);

  // First session ever
  if (!current.last_session_date) {
    return {
      streak: 1,
      best_streak: Math.max(current.best_streak, 1),
      last_session_date: sessionDateStr,
      changed: true,
    };
  }

  const daysDiff = diffInDays(sessionDate, current.last_session_date);

  // Already trained today
  if (daysDiff === 0) {
    return {
      streak: current.streak,
      best_streak: current.best_streak,
      last_session_date: sessionDateStr,
      changed: false,
    };
  }

  // Session in the past (shouldn't happen, but handle gracefully)
  if (daysDiff < 0) {
    return {
      streak: current.streak,
      best_streak: current.best_streak,
      last_session_date: current.last_session_date.toISOString().slice(0, 10),
      changed: false,
    };
  }

  // Consecutive day
  if (daysDiff === 1) {
    const newStreak = current.streak + 1;
    return {
      streak: newStreak,
      best_streak: Math.max(current.best_streak, newStreak),
      last_session_date: sessionDateStr,
      changed: true,
    };
  }

  // Gap > 1 day → reset
  return {
    streak: 1,
    best_streak: Math.max(current.best_streak, 1),
    last_session_date: sessionDateStr,
    changed: true,
  };
}

export interface StreakStatus {
  currentStreak: number;
  hoursRemaining: number;
  isAtRisk: boolean;
}

/**
 * Computes how much time the user has left before losing the current streak.
 *
 * The streak is alive while the next session occurs within 1 calendar day of
 * `last_session_date`. The deadline is therefore the start of
 * `last_session_date + 2 days` (UTC). Any moment after that, the next session
 * resets the streak to 1.
 *
 * `isAtRisk` is true when there is an active streak and 24h or less remain.
 */
export function calculateStreakStatus(
  state: Pick<StreakState, 'streak' | 'last_session_date'>,
  now: Date = new Date()
): StreakStatus {
  if (state.streak <= 0 || !state.last_session_date) {
    return { currentStreak: 0, hoursRemaining: 0, isAtRisk: false };
  }

  const lastDay = toDateOnly(state.last_session_date);
  const deadline = new Date(lastDay.getTime() + 2 * 86_400_000);
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = Math.max(0, Math.ceil(msRemaining / 3_600_000));

  return {
    currentStreak: state.streak,
    hoursRemaining,
    isAtRisk: hoursRemaining > 0 && hoursRemaining <= 24,
  };
}
