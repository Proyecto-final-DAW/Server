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

export interface ExerciseSet {
  id: number;
  session_exercise_id: number;
  reps: number;
  weight: number;
  order_index: number;
}

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_api_id: string;
  name: string;
  type: ExerciseType;
  order_index: number;
  sets: ExerciseSet[];
}

export interface Session {
  id: number;
  user_id: number;
  routine_id: number | null;
  date: string;
  created_at: Date;
  exercises: SessionExercise[];
}

export interface CreateSessionSetInput {
  reps: number;
  weight: number;
}

export interface CreateSessionExerciseInput {
  exercise_api_id: string;
  name: string;
  type: ExerciseType;
  sets: CreateSessionSetInput[];
}

export interface CreateSessionInput {
  date: string;
  routine_id?: number | null;
  exercises: CreateSessionExerciseInput[];
}
