import { SessionSet } from './SessionSet';

export type ExerciseType = 'STRENGTH' | 'CARDIO' | 'EXPLOSIVE' | 'STRETCH';

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_name: string;
  type: ExerciseType;
  exercise_api_id: string | null;
  muscle_group: string;
  sets: SessionSet[];
}
