import { z } from 'zod';

// Mirrors the Prisma `Sex` enum (MALE | FEMALE | NON_BINARY) and the
// onboarding/profile schemas. The macros service averages the male
// and female BMR offsets when sex is NON_BINARY.
const sexSchema = z.enum(['MALE', 'FEMALE', 'NON_BINARY']);
const goalSchema = z.enum(['LOSE_FAT', 'GAIN_MUSCLE', 'MAINTAIN', 'HEALTH']);

/**
 * Body for `POST /users/:userId/macros/calculate`. Bounds match
 * `updateProfileSchema` so a profile recalculation cannot persist values
 * the profile editor itself would have rejected.
 *
 * `activityFactor` is a Mifflin–St Jeor multiplier; values outside the
 * standard 1.2–1.9 PAL range are physiologically meaningless.
 */
export const calculateMacrosSchema = z
  .object({
    weightKg: z
      .number()
      .positive('weightKg must be a positive number')
      .max(500, 'weightKg must be at most 500'),
    heightCm: z
      .number()
      .positive('heightCm must be a positive number')
      .max(300, 'heightCm must be at most 300'),
    age: z
      .number()
      .int('age must be an integer')
      .positive('age must be a positive integer')
      .max(120, 'age must be at most 120'),
    sex: sexSchema,
    activityFactor: z
      .number()
      .min(1.2, 'activityFactor must be at least 1.2')
      .max(1.9, 'activityFactor must be at most 1.9'),
    goal: goalSchema,
    save: z.boolean().optional(),
  })
  .strict();

export type CalculateMacrosBody = z.infer<typeof calculateMacrosSchema>;
