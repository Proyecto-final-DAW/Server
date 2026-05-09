export interface RoutineExercise {
  id: number;
  routine_id: number;
  exercise_api_id: string;
  exercise_name: string | null;
  sets: number | null;
  reps: number | null;
  order_index: number | null;
  /** Hydrated from the catalog at read time — not persisted on
   *  routine_exercises rows. Drives the SetLogger input selection
   *  (stretching → duration, bodyweight → reps only, etc.). */
  category?: string;
  equipment?: string;
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
