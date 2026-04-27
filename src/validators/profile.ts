import { z } from 'zod';

const trimmed = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), schema);

const goalSchema = z.enum(['LOSE_FAT', 'GAIN_MUSCLE', 'MAINTAIN', 'HEALTH']);

const activityLevelSchema = z.enum([
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
]);

/**
 * Body for `PUT /profile/me`. All fields are optional; the service whitelists
 * which columns to update. Only fields actually present in the request are
 * persisted.
 */
export const updateProfileSchema = z
  .object({
    name: trimmed(
      z
        .string()
        .min(1, 'name must not be empty')
        .max(255, 'name must be at most 255 characters')
    ).optional(),
    weight: z
      .number()
      .positive('weight must be a positive number')
      .max(500, 'weight must be at most 500 kg')
      .optional(),
    height: z
      .number()
      .positive('height must be a positive number')
      .max(300, 'height must be at most 300 cm')
      .optional(),
    age: z
      .number()
      .int('age must be an integer')
      .positive('age must be a positive number')
      .max(120, 'age must be at most 120')
      .optional(),
    activity_level: activityLevelSchema.optional(),
    goals: z.array(goalSchema).optional(),
    sleep_hours: z
      .number()
      .int('sleep_hours must be an integer')
      .min(0, 'sleep_hours must be 0 or more')
      .max(24, 'sleep_hours must be at most 24')
      .optional(),
  })
  .strict();

/**
 * Body for `PUT /profile/me/password`. Mirrors the legacy server-side message
 * which expects newPassword to be at least 6 characters.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: z
      .string()
      .min(6, 'newPassword must be at least 6 characters')
      .max(128, 'newPassword must be at most 128 characters'),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
