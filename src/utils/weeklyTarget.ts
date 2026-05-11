/**
 * Resolves the user's weekly training target from the bucketed
 * `days_per_week` value stored on the user (onboarding answer).
 *
 * Buckets are ranges. We take the **lower bound** of each range so
 * the target reads as "the minimum to keep your streak alive". A
 * user who picked "4-5" can hit 4 sessions and feel safe — the upper
 * bound (5) framed the same input as a slightly-out-of-reach goal
 * and undermined the racha grace mechanic. The lower bound also
 * matches the user's mental model: they marked the day count they
 * are *willing to commit to*, not the one they aspire to.
 *
 * `6+` is open-ended; we keep it at 6 because that is both the lower
 * bound of the bucket and the practical ceiling the streak supports
 * (a 7-day target effectively means "lift every single day", which
 * the app advises against).
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
      return 2;
    case '4-5':
      return 4;
    case '6+':
      return 6;
    default:
      return 1;
  }
};

/** Smallest value the target can take; exposed for clamping/tests. */
export const MIN_WEEKLY_TARGET = 1;
