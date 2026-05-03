import { z } from 'zod';

/**
 * Body for `POST /character/choose`. Tier is restricted to 1, 2 or 3 — the
 * three user-driven choice points (T0 is the start, T4–T6 are automatic).
 * Class IDs are short PascalCase identifiers (`GUERRERO`, `CABALLERO_APOCALIPTICO`).
 * Per-ID validity is checked against the catalog inside the service layer.
 */
export const chooseClassSchema = z
  .object({
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    classId: z
      .string()
      .min(1, 'classId is required')
      .max(50, 'classId must be at most 50 characters'),
  })
  .strict();

export type ChooseClassBody = z.infer<typeof chooseClassSchema>;
