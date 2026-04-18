export interface RoutineExercise {
  id: number;
  routine_id: number;
  exercise_api_id: string;
  exercise_name: string | null;
  sets: number | null;
  reps: number | null;
  order_index: number | null;
}

export interface Routine {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  exercises?: RoutineExercise[];
}
