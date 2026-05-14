/**
 * Local-timezone YYYY-MM-DD string. Matches the user's perceived
 * "today" rather than UTC, so it lines up with what the client sends
 * (built from `getFullYear/getMonth/getDate`). Using `toISOString()`
 * here would silently flip the date for any user in a TZ ahead of UTC
 * between local midnight and UTC midnight — making "today" comparisons
 * fail for sessions saved in the first hours after local midnight.
 *
 * Optional `date` parameter exists so callers that already have a
 * specific instant (cron jobs, retry logic) can format it without
 * re-instantiating `new Date()`.
 */
export const localTodayISO = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Parses a `YYYY-MM-DD` string back into a Date at *local* midnight,
 * mirroring how `localTodayISO()` produced it. `new Date('YYYY-MM-DD')`
 * would parse the same string as UTC midnight, which then leaks into
 * `isoWeekMonday()` via the local-time getters and shifts the ISO
 * week one day back at year/week boundaries in any TZ behind UTC.
 * Building the Date from explicit components keeps the local-day
 * stable end-to-end.
 */
export const parseLocalDay = (yyyyMmDd: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(yyyyMmDd);
  if (!match) return new Date(yyyyMmDd);
  return new Date(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10)
  );
};
