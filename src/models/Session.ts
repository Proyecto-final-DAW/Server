/**
 * Session.ts — Training session data shape
 *
 * Exercise types map to RPG stats:
 * - strength  → fuerza (weight-based exercises)
 * - cardio    → endurance (cardio exercises)
 * - explosive → stamina (explosive/power exercises)
 * - stretch   → agility (stretching/flexibility exercises)
 */

export type ExerciseType = 'strength' | 'cardio' | 'explosive' | 'stretch';

export interface SessionSet {
  reps: number;
  weight: number;
}

export interface SessionExercise {
  exerciseId: string;
  name: string;
  type: ExerciseType;
  sets: SessionSet[];
}

export interface Session {
  id: number;
  user_id: number;
  exercises: SessionExercise[];
  created_at: Date;
}
