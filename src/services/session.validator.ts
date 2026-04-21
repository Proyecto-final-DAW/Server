import { ExerciseType } from '@prisma/client';

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

export type CreateSessionBody = {
  routineId?: number | null;
  date: string;
  notes?: string | null;
  exercises: unknown;
};

export type CreateSessionServiceInput = {
  userId: number;
  routineId?: number | null;
  date: Date;
  notes?: string | null;
  exercises: SessionExerciseInput[];
};

const MAX_EXERCISE_NAME_LENGTH = 200;
const MAX_MUSCLE_GROUP_LENGTH = 100;
const MAX_NOTES_LENGTH = 500;

export const isValidDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return !Number.isNaN(new Date(value).getTime());
};

export const isValidExerciseType = (value: unknown): value is ExerciseType => {
  return (
    typeof value === 'string' &&
    Object.values(ExerciseType).includes(value as ExerciseType)
  );
};

export const isValidSet = (
  unknownSet: unknown
): unknownSet is SessionSetInput => {
  if (
    !unknownSet ||
    typeof unknownSet !== 'object' ||
    Array.isArray(unknownSet)
  ) {
    return false;
  }

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
  if (
    !unknownExercise ||
    typeof unknownExercise !== 'object' ||
    Array.isArray(unknownExercise)
  ) {
    return false;
  }

  const exerciseRecord = unknownExercise as Record<string, unknown>;

  return (
    typeof exerciseRecord.exercise_name === 'string' &&
    exerciseRecord.exercise_name.trim().length > 0 &&
    exerciseRecord.exercise_name.length <= MAX_EXERCISE_NAME_LENGTH &&
    isValidExerciseType(exerciseRecord.type) &&
    (exerciseRecord.exercise_api_id === undefined ||
      exerciseRecord.exercise_api_id === null ||
      typeof exerciseRecord.exercise_api_id === 'string') &&
    typeof exerciseRecord.muscle_group === 'string' &&
    exerciseRecord.muscle_group.trim().length > 0 &&
    exerciseRecord.muscle_group.length <= MAX_MUSCLE_GROUP_LENGTH &&
    Array.isArray(exerciseRecord.sets) &&
    exerciseRecord.sets.length > 0 &&
    exerciseRecord.sets.every(isValidSet)
  );
};

export const getSessionValidationError = ({
  routineId,
  date,
  notes,
  exercises,
}: {
  routineId?: number | null;
  date?: unknown;
  notes?: string | null;
  exercises?: unknown;
}): string | null => {
  if (
    routineId !== undefined &&
    routineId !== null &&
    typeof routineId !== 'number'
  ) {
    return 'routineId must be a number or null';
  }

  if (!isValidDate(date)) {
    return 'A valid date is required';
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return 'notes must be a string or null';
  }

  if (typeof notes === 'string' && notes.length > MAX_NOTES_LENGTH) {
    return `notes must be at most ${MAX_NOTES_LENGTH} characters`;
  }

  if (!Array.isArray(exercises) || exercises.length === 0) {
    return 'Exercises array is required and cannot be empty';
  }

  if (!exercises.every(isValidExercise)) {
    return `Each exercise must include exercise_name (max ${MAX_EXERCISE_NAME_LENGTH}), a valid type, optional exercise_api_id, muscle_group (max ${MAX_MUSCLE_GROUP_LENGTH}), and a non-empty sets array with set_number, reps and weight`;
  }

  return null;
};
