import { z } from 'zod';

const trimmed = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), schema);

const sexSchema = z.enum(['MALE', 'FEMALE']);

const goalSchema = z.enum(['LOSE_FAT', 'GAIN_MUSCLE', 'MAINTAIN', 'HEALTH']);

const activityLevelSchema = z.enum([
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
]);

const experienceLevelSchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);

const equipmentSchema = z.enum(['FULL_GYM', 'HOME_WEIGHTS', 'BODYWEIGHT']);

const injurySchema = z.enum(['NONE', 'KNEE', 'BACK', 'SHOULDER', 'OTHER']);

/**
 * Body for `PUT /onboarding/:userId/submit`. The service treats an empty string
 * the same as undefined (skipped), so optional empty strings are tolerated.
 */
export const submitOnboardingSchema = z
  .object({
    name: trimmed(
      z
        .string()
        .min(1, 'name is required')
        .max(255, 'name must be at most 255 characters')
    ),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be in YYYY-MM-DD format'),
    weight: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/, 'weight must be a numeric string'),
    height: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/, 'height must be a numeric string'),
    sex: sexSchema.optional(),
    activityLevel: activityLevelSchema.optional(),
    goals: z.array(goalSchema).optional(),
    experienceLevel: experienceLevelSchema.optional(),
    equipment: equipmentSchema.optional(),
    daysPerWeek: z
      .string()
      .max(10, 'daysPerWeek must be at most 10 characters')
      .optional(),
    injuries: z.array(injurySchema).optional(),
  })
  .strict();

export type SubmitOnboardingBody = z.infer<typeof submitOnboardingSchema>;
