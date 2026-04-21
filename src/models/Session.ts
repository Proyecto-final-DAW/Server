import { SessionExercise } from './SessionExercise';

export interface Session {
  id: number;
  user_id: number;
  routine_id?: number | null;
  date: Date;
  notes?: string | null;
  exercises: SessionExercise[];
  created_at: Date;
}
