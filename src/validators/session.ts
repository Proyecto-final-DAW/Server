import { z } from 'zod';

const exerciseTypeSchema = z.enum([
  'strength',
  'cardio',
  'explosive',
  'stretch',
]);

const setSchema = z
  .object({
    reps: z
      .number()
      .int('reps must be an integer')
      .positive('reps must be greater than 0'),
    weight: z
      .number()
      .nonnegative('weight must be 0 or more')
      .finite('weight must be finite'),
  })
  .strict();

const exerciseSchema = z
  .object({
    exercise_api_id: z
      .string()
      .min(1, 'exercise_api_id is required')
      .max(50, 'exercise_api_id must be at most 50 characters'),
    name: z
      .string()
      .min(1, 'name is required')
      .max(200, 'name must be at most 200 characters'),
    type: exerciseTypeSchema,
    sets: z.array(setSchema).min(1, 'each exercise must have at least one set'),
  })
  .strict();

/**
 * Body for `POST /sessions`. Date is a calendar day (YYYY-MM-DD) in the user's
 * local timezone. `routine_id` is optional and may be null when the session
 * is freeform.
 */
export const createSessionSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
    routine_id: z
      .number()
      .int('routine_id must be an integer')
      .positive('routine_id must be a positive integer')
      .nullable()
      .optional(),
    exercises: z
      .array(exerciseSchema)
      .min(1, 'exercises array is required and cannot be empty'),
  })
  .strict();

export type CreateSessionBody = z.infer<typeof createSessionSchema>;
