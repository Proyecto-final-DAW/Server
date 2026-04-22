import { SessionExerciseInput } from '../services/session.validator';

export type CreateSessionData = {
  userId: number;
  routineId?: number | null;
  date: Date;
  notes?: string | null;
  exercises: SessionExerciseInput[];
};

export type SessionRow = {
  id: number;
  user_id: number;
  routine_id: number | null;
  date: Date;
  notes: string | null;
  created_at: Date;
};

export type SessionExerciseRow = {
  id: number;
  session_id: number;
  exercise_name: string;
  type: string;
  exercise_api_id: string | null;
  muscle_group: string;
};

export type SessionSetRow = {
  id: number;
  session_exercise_id: number;
  set_number: number;
  reps: number;
  weight: string;
};

export type CreatedSessionGraph = {
  session: SessionRow;
  exercises: Array<
    SessionExerciseRow & {
      sets: SessionSetRow[];
    }
  >;
};
