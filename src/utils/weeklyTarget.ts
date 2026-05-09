/**
 * Resolves the user's weekly training target from the bucketed
 * `days_per_week` value stored on the user (onboarding answer).
 *
 * Buckets are ranges ('2-3', '4-5', '6+'); we take the **upper bound**
 * because that's what the user reads as their goal. Someone who picked
 * "2-3 dias" is mentally aiming at 3, not 2 — showing "0/2 esta semana"
 * after they pick "2-3" feels off ("I asked for 3, where did 2 come
 * from?"). The streak now qualifies on hitting the ambitious end of
 * the range, matching the user's stated intent.
 *
 * '6+' is open-ended (6 or more); we clamp it to 6, the lower edge,
 * since there's no defined upper bound and 6 is already the highest
 * weekly target the system needs to support.
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
      return 6;
    default:
      return 1;
  }
};

/** Smallest value the target can take; exposed for clamping/tests. */
export const MIN_WEEKLY_TARGET = 1;
