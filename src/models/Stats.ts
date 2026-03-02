/**
 * Stats.ts — RPG stats data shape
 *
 * 6 RPG system stats:
 * - Strength    → weight lifted in exercises
 * - Endurance   → sets × reps
 * - Stamina     → cardio exercises
 * - Agility     → body weight loss
 * - Tenacity    → streak and total sessions
 * - Vigor       → hitting nutrition macros
 */

export interface Stats {
  id: number;
  user_id: number;
  strength: number;
  endurance: number;
  stamina: number;
  agility: number;
  tenacity: number;
  vigor: number;
  strength_level: number;
  endurance_level: number;
  stamina_level: number;
  agility_level: number;
  tenacity_level: number;
  vigor_level: number;
  streak: number;
  best_streak: number;
  last_session_date: Date | null;
  updated_at: Date;
}

export type StatsPublic = Omit<Stats, 'id'>;
