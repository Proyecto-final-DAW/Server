/**
 * Stats.ts — La forma de los datos de stats RPG
 *
 * 6 stats del sistema RPG:
 * - Fuerza (strength)     → peso levantado en ejercicios
 * - Resistencia (endurance) → series × reps
 * - Estamina (stamina)    → ejercicios de cardio
 * - Agilidad (agility)    → bajada de peso corporal
 * - Tenacidad (tenacity)  → racha y sesiones totales
 * - Vigor (vigor)         → cumplir macros de nutrición
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
