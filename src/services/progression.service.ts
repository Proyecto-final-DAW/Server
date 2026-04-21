import { SessionExerciseInput } from './session.validator';
import { ExerciseType } from '../models/SessionExercise';

/**
 * Maps exercise types to their corresponding RPG stat columns.
 */
const STAT_MAP: Record<ExerciseType, string> = {
  STRENGTH: 'strength',
  CARDIO: 'endurance',
  EXPLOSIVE: 'stamina',
  STRETCH: 'agility',
};

const LEVEL_MAP: Record<ExerciseType, string> = {
  STRENGTH: 'strength_level',
  CARDIO: 'endurance_level',
  EXPLOSIVE: 'stamina_level',
  STRETCH: 'agility_level',
};

const XP_THRESHOLD = 100;
const VOLUME_DIVISOR = 100;
const FIXED_XP = 15;

/**
 * Calculates XP earned by a single exercise.
 * - Strength: volume-based (weight × reps × sets / 100), min 1
 * - Others: fixed points per exercise
 */
const calculateExerciseXp = (exercise: SessionExerciseInput): number => {
  if (exercise.type === 'STRENGTH') {
    const volume = exercise.sets.reduce((total, set) => {
      return total + set.weight * set.reps;
    }, 0);
    return Math.max(1, Math.floor(volume / VOLUME_DIVISOR));
  }
  return FIXED_XP;
};

interface StatGain {
  stat: string;
  level: string;
  xp: number;
}

/**
 * Aggregates XP gains per stat from a list of exercises.
 */
export const calculateGains = (
  exercises: SessionExerciseInput[]
): Map<ExerciseType, StatGain> => {
  const gains = new Map<ExerciseType, StatGain>();

  for (const exercise of exercises) {
    const xp = calculateExerciseXp(exercise);
    const existing = gains.get(exercise.type);

    if (existing) {
      existing.xp += xp;
    } else {
      gains.set(exercise.type, {
        stat: STAT_MAP[exercise.type],
        level: LEVEL_MAP[exercise.type],
        xp,
      });
    }
  }

  return gains;
};

interface StatUpdate {
  [key: string]: number;
}

/**
 * Applies XP gains to current stats, handling level-ups when XP >= 100.
 * Returns a flat object ready for the stats update query.
 */
export const applyGains = (
  currentStats: Record<string, number>,
  gains: Map<ExerciseType, StatGain>
): StatUpdate => {
  const updates: StatUpdate = {};

  for (const gain of gains.values()) {
    let currentXp = (currentStats[gain.stat] as number) + gain.xp;
    let currentLevel = currentStats[gain.level] as number;

    while (currentXp >= XP_THRESHOLD) {
      currentXp -= XP_THRESHOLD;
      currentLevel += 1;
    }

    updates[gain.stat] = currentXp;
    updates[gain.level] = currentLevel;
  }

  return updates;
};
