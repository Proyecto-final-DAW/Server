import { SessionSet } from './SessionSet';

export type ExerciseType = 'STRENGTH' | 'CARDIO' | 'EXPLOSIVE' | 'STRETCH';

export interface SessionExercise {
  exerciseId: number;
  session_id: number;
  name: string;
  type: ExerciseType;
  exercise_api_id: string | null;
  muscle_group: string;
  sets: SessionSet[];
}
