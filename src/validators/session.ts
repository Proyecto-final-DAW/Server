import { z } from 'zod';

const exerciseTypeSchema = z.enum([
  'strength',
  'cardio',
  'explosive',
  'stretch',
]);

const cardioIntensitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

const setSchema = z
  .object({
    reps: z
      .number()
      .int('reps must be an integer')
      .nonnegative('reps must be 0 or more'),
    weight: z
      .number()
      .nonnegative('weight must be 0 or more')
      .finite('weight must be finite'),
    /**
     * Hold time for stretch / mobility sets. Optional — stays absent
     * for cadence-based sets (strength, bodyweight reps). When set,
     * `reps` is allowed to be 0 (zero-rep stretch is the normal case).
     */
    duration_seconds: z
      .number()
      .int('duration_seconds must be an integer')
      .positive('duration_seconds must be greater than 0')
      .max(3600, 'duration_seconds must be at most 3600')
      .optional(),
  })
  .strict()
  // A set must have either reps > 0 or a duration. Both can be present
  // (some mobility moves count holds in reps too) but neither can be
  // absent — an empty set entry is meaningless.
  .refine((data) => data.reps > 0 || data.duration_seconds !== undefined, {
    message: 'each set must have reps > 0 or a duration',
    path: ['reps'],
  });

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
    sets: z.array(setSchema),
    /** Cardio metadata — present only on post-workout cardio entries. */
    duration_minutes: z
      .number()
      .int('duration_minutes must be an integer')
      .positive('duration_minutes must be greater than 0')
      .max(600, 'duration_minutes must be at most 600')
      .optional(),
    intensity: cardioIntensitySchema.optional(),
    distance_km: z
      .number()
      .nonnegative('distance_km must be 0 or more')
      .max(1000, 'distance_km must be at most 1000')
      .finite('distance_km must be finite')
      .optional(),
  })
  .strict()
  // Strength entries must carry at least one set; cardio entries must
  // carry a duration. An empty record (no sets, no duration) is rejected.
  .refine(
    (data) => data.sets.length > 0 || data.duration_minutes !== undefined,
    {
      message: 'each exercise must have at least one set or a duration',
      path: ['sets'],
    }
  )
  // Intensity only makes sense with a duration; surface a clear error
  // rather than silently ignore a stray field.
  .refine(
    (data) =>
      data.intensity === undefined || data.duration_minutes !== undefined,
    {
      message: 'intensity requires duration_minutes',
      path: ['intensity'],
    }
  );

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
