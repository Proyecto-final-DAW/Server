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

const experienceLevelSchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);

const equipmentSchema = z.enum(['FULL_GYM', 'HOME_WEIGHTS', 'BODYWEIGHT']);

const daysPerWeekSchema = z.enum(['2-3', '4-5', '6+']);

const injurySchema = z.enum(['NONE', 'KNEE', 'BACK', 'SHOULDER', 'OTHER']);

const sexSchema = z.enum(['MALE', 'FEMALE', 'NON_BINARY']);

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
    sex: sexSchema.optional(),
    experience_level: experienceLevelSchema.optional(),
    equipment: z.array(equipmentSchema).optional(),
    days_per_week: daysPerWeekSchema.optional(),
    injuries: z.array(injurySchema).optional(),
  })
  .strict();

/**
 * Body for `PUT /profile/me/password`. Min length matches the register
 * schema in `validators/auth.ts` so a user cannot set a weaker password
 * via change-password than they could during signup.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: z
      .string()
      .min(8, 'newPassword must be at least 8 characters')
      .max(128, 'newPassword must be at most 128 characters'),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
