/**
 * Resolves the user's weekly training target from the bucketed
 * `days_per_week` value stored on the user (onboarding answer).
 *
 * Buckets are ranges. For the closed ranges we take the **upper
 * bound** (the ambitious end) — someone who picked "2-3 dias" is
 * mentally aiming at 3, not 2; showing "0/2 esta semana" after
 * picking "2-3" feels off ("I asked for 3, where did 2 come from?").
 *
 * The asymmetry to flag: `6+` is open-ended, so there is no defined
 * upper bound to take. We clamp it to 6 — the only finite anchor
 * available — even though that breaks the "ambitious end" rule. In
 * practice this is fine: 6 is the highest weekly target the streak
 * system needs to support (a 7-day streak target would mean "lift
 * every single day" which the app actively recommends against), and
 * a `6+` user already proved willingness to hit 6, which the streak
 * recognises.
 *
 * Falls back to 1 (the loosest possible target) when the field is
 * missing — the streak then degrades to "any session per week"
 * without crashing.
 */
export const parseDaysPerWeekTarget = (
  daysPerWeek: string | null | undefined
): number => {
  if (!daysPerWeek) return 1;

  switch (daysPerWeek) {
    case '2-3':
      return 3;
    case '4-5':
      return 5;
    case '6+':
      // See doc comment above — clamped to 6 by design, not by bug.
      return 6;
    default:
      return 1;
  }
};

/** Smallest value the target can take; exposed for clamping/tests. */
export const MIN_WEEKLY_TARGET = 1;
