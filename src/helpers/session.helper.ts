import { ExerciseType } from '../models/SessionExercise';

export type SessionSetInput = {
  set_number: number;
  reps: number;
  weight: number;
};

export type SessionExerciseInput = {
  exercise_name: string;
  type: ExerciseType;
  exercise_api_id?: string | null;
  muscle_group: string;
  sets: SessionSetInput[];
};

export type CreateSessionInput = {
  userId: number;
  routineId?: number | null;
  date: Date;
  notes?: string | null;
  exercises: SessionExerciseInput[];
};

export const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return !Number.isNaN(new Date(value).getTime());
};

export const isValidSet = (
  unknownSet: unknown
): unknownSet is SessionSetInput => {
  if (!unknownSet || typeof unknownSet !== 'object') return false;

  const setRecord = unknownSet as Record<string, unknown>;

  return (
    typeof setRecord.set_number === 'number' &&
    setRecord.set_number > 0 &&
    typeof setRecord.reps === 'number' &&
    setRecord.reps > 0 &&
    typeof setRecord.weight === 'number' &&
    setRecord.weight >= 0
  );
};

export const isValidExercise = (
  unknownExercise: unknown
): unknownExercise is SessionExerciseInput => {
  if (!unknownExercise || typeof unknownExercise !== 'object') return false;

  const exerciseRecord = unknownExercise as Record<string, unknown>;

  return (
    typeof exerciseRecord.exercise_name === 'string' &&
    exerciseRecord.exercise_name.trim().length > 0 &&
    (exerciseRecord.exercise_api_id === undefined ||
      exerciseRecord.exercise_api_id === null ||
      typeof exerciseRecord.exercise_api_id === 'string') &&
    typeof exerciseRecord.muscle_group === 'string' &&
    exerciseRecord.muscle_group.trim().length > 0 &&
    Array.isArray(exerciseRecord.sets) &&
    exerciseRecord.sets.length > 0 &&
    exerciseRecord.sets.every(isValidSet)
  );
};

export const getSessionValidationError = ({
  routineId,
  notes,
  exercises,
}: {
  routineId?: number | null;
  notes?: string | null;
  exercises?: unknown[];
}): string | null => {
  return routineId !== undefined &&
    routineId !== null &&
    typeof routineId !== 'number'
    ? 'routineId must be a number or null'
    : notes !== undefined && notes !== null && typeof notes !== 'string'
      ? 'notes must be a string or null'
      : !Array.isArray(exercises) || exercises.length === 0
        ? 'Exercises array is required and cannot be empty'
        : !exercises.every(isValidExercise)
          ? 'Each exercise must include exercise_name, optional exercise_api_id, muscle_group, and a non-empty sets array with set_number, reps and weight'
          : null;
};
