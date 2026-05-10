import { z } from 'zod';

/**
 * Body for `POST /progress/:userId/weight`. Mirrors the bounds the
 * controller used to enforce ad-hoc with `Number(weight)` plus the
 * `WEIGHT_KG_MIN/MAX` constants. Going through Zod here lines this
 * endpoint up with the rest of the API surface (every other write
 * endpoint runs through `validateBody`) and rejects bonus fields
 * via `.strict()`.
 *
 * `date` is optional and accepts either a calendar string
 * (YYYY-MM-DD) or a full ISO timestamp; the controller normalizes
 * whichever it receives. Allowing both means the form can omit the
 * field for "register today" and still pre-fill a different day from
 * the calendar picker without juggling formats.
 */
export const registerWeightSchema = z
  .object({
    weight: z
      .number()
      .min(20, 'Weight must be a number between 20 and 400 kg')
      .max(400, 'Weight must be a number between 20 and 400 kg')
      .finite('weight must be finite'),
    // Same future-date guard as the session schema. A weight log on a
    // future date corrupts WeightProgressChart's x-axis and is never a
    // legitimate user action. Backdating remains allowed.
    date: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T.+)?$/,
        'date must be YYYY-MM-DD or an ISO timestamp'
      )
      .refine(
        (v) => {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) return false;
          return d.getTime() <= Date.now() + 24 * 60 * 60 * 1000;
        },
        { message: 'date cannot be in the future' }
      )
      .optional(),
  })
  .strict();

export type RegisterWeightBody = z.infer<typeof registerWeightSchema>;
