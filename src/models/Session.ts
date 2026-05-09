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

export type CardioIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExerciseSet {
  id: number;
  session_exercise_id: number;
  reps: number;
  weight: number;
  /** Hold time for stretching / mobility sets. Null for cadence-based
   *  sets (strength, bodyweight reps). */
  duration_seconds: number | null;
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
  /** Cardio metadata — null on strength entries, populated on the
   *  post-workout cardio log row. */
  duration_minutes?: number | null;
  intensity?: CardioIntensity | null;
  distance_km?: number | null;
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
  /** Optional. Present on stretch / mobility sets. */
  duration_seconds?: number | null;
}

export interface CreateSessionExerciseInput {
  exercise_api_id: string;
  name: string;
  type: ExerciseType;
  sets: CreateSessionSetInput[];
  /** Optional cardio metadata. When present, the entry is treated as a
   *  cardio activity (no sets, XP from duration × intensity). */
  duration_minutes?: number;
  intensity?: CardioIntensity;
  distance_km?: number;
}

export interface CreateSessionInput {
  date: string;
  routine_id?: number | null;
  exercises: CreateSessionExerciseInput[];
}
