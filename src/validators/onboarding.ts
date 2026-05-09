import { z } from 'zod';

const trimmed = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), schema);

// Accepts the same enum values as the Prisma `Sex` type. NON_BINARY
// was previously rejected here even though `validators/profile.ts`
// and `prisma/schema.prisma` accept it, which forced a non-binary
// user to onboard as MALE/FEMALE first and then change it from the
// profile screen — a UX hole. The macro calculator below handles
// NON_BINARY by averaging the male/female BMR offsets.
const sexSchema = z.enum(['MALE', 'FEMALE', 'NON_BINARY']);

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

/**
 * Body for `PUT /onboarding/:userId/submit`. The service treats an empty string
 * the same as undefined (skipped), so optional empty strings are tolerated.
 *
 * Fields the macro calculator NEEDS to produce a valid plan
 * (`sex`, `activityLevel`, `goals`, `equipment`, `daysPerWeek`) are
 * required here. The wizard already enforces these per-step on the
 * client, but a direct API call previously could submit with any of
 * them empty — onboarding then completed but `getCurrentMacros`
 * threw `ONBOARDING_INCOMPLETE` on the next /diet GET, leaving the
 * user in a "completed but unusable" state. `experienceLevel` and
 * `injuries`/`injuryNotes` stay optional (informational, not used by
 * the calorie formula).
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
    sex: sexSchema,
    activityLevel: activityLevelSchema,
    goals: z.array(goalSchema).min(1, 'goals must include at least one entry'),
    equipment: z
      .array(equipmentSchema)
      .min(1, 'equipment must include at least one entry'),
    daysPerWeek: daysPerWeekSchema,
    experienceLevel: experienceLevelSchema.optional(),
    injuries: z.array(injurySchema).optional(),
    /** Free-text detail surfaced when the user marks 'OTHER' in the
     *  injuries step. Optional — capped at 500 chars to match the DB
     *  column and keep payloads bounded. */
    injuryNotes: trimmed(
      z.string().max(500, 'injuryNotes must be at most 500 characters')
    ).optional(),
  })
  .strict();

export type SubmitOnboardingBody = z.infer<typeof submitOnboardingSchema>;
