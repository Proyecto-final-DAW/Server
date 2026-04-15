import { SessionExercise } from './SessionExercise';
/**
 * Session.ts — Training session data shape
 *
 * Exercise types map to RPG stats:
 * - strength  → fuerza (weight-based exercises)
 * - cardio    → endurance (cardio exercises)
 * - explosive → stamina (explosive/power exercises)
 * - stretch   → agility (stretching/flexibility exercises)
 */

export interface Session {
  id: number;
  user_id: number;
  routine_id?: number | null;
  date: Date;
  notes?: string | null;
  exercises: SessionExercise[];
  created_at: Date;
}
