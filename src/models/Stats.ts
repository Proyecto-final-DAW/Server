/**
 * Stats.ts — RPG stats data shape
 *
 * 6 RPG pillars (mapping to the formulas in `progression.service.ts`):
 * - Strength    → strength-exercise volume (weight × reps)
 * - Endurance   → cardio (minutes × intensity)
 * - Stamina     → total set count across the session
 * - Agility     → base + half of cardio XP
 * - Tenacity    → weekly training streak (lives in `session.service`)
 * - Vigor       → daily diet logging + nutrition macros (lives in `diet.service`)
 *
 * The previous version of this comment had stamina/endurance swapped and
 * agility tied to "body weight loss" — both wrong vs the actual formulas.
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
