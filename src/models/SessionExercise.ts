import { SessionSet } from './SessionSet';

export type ExerciseType = 'strength' | 'cardio' | 'explosive' | 'stretch';

export interface SessionExercise {
  exerciseId: string;
  session_id: number;
  name: string;
  type: ExerciseType;
  exercise_api_id: string | null;
  muscle_group: string;
  sets: SessionSet[];
}
