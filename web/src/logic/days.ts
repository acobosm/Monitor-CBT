// Statistics day = Cloudflare's UTC day (19:00 to 19:00 ECT). Pure functions: "now" is always passed in.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Days back the daily task fills in (P6: zone datasets keep 31 days; P11: Worker requests get coarse at about 30). */
export const BACKFILL_DAYS = 29;
/** IPs older than this many calendar months are deleted (R32). */
export const IP_RETENTION_MONTHS = 13;
/** Ecuador (ECT) is always UTC−05:00, with no daylight saving time. */
const ECT_OFFSET_MS = -5 * HOUR_MS;

/** UTC day of a date, as `YYYY-MM-DD`. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

/** The day the daily task processes: yesterday in UTC (R28). */
export function previousUtcDay(now: Date): string {
  return addDays(utcDay(now), -1);
}

/** True for the day in progress, whose data is partial (R22, R34). */
export function isPartialDay(day: string, now: Date): boolean {
  return day === utcDay(now);
}

/** Complete days within the last `window` days (today excluded) that are not stored, oldest first (R31). */
export function missingDays(stored: Iterable<string>, now: Date, window = BACKFILL_DAYS): string[] {
  const have = new Set(stored);
  const today = utcDay(now);
  const missing: string[] = [];
  for (let back = window; back >= 1; back--) {
    const day = addDays(today, -back);
    if (!have.has(day)) missing.push(day);
  }
  return missing;
}

/**
 * First day whose IPs are kept: the same day 13 calendar months back, clamped to the last day of
 * that month (31 March → 28 or 29 February). IP rows with an earlier day are deleted (R32).
 */
export function ipCutoffDay(now: Date): string {
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - IP_RETENTION_MONTHS, 1));
  const year = firstOfMonth.getUTCFullYear();
  const month = firstOfMonth.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return utcDay(new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), lastDayOfMonth))));
}

/** ECT hour range of a UTC hour start, e.g. `2026-10-28T19:00:00Z` → `14:00–15:00` (R25, R26). */
export function ectHourRange(hourUtc: string): string {
  const start = Date.parse(hourUtc);
  if (Number.isNaN(start)) throw new Error(`Invalid hour: ${hourUtc}`);
  const hour = (ms: number) => `${String(new Date(ms + ECT_OFFSET_MS).getUTCHours()).padStart(2, "0")}:00`;
  return `${hour(start)}–${hour(start + HOUR_MS)}`;
}

/**
 * Days to recover (R31, P9): missing days of the last `window` days that come after the first stored day.
 * Nothing before the first stored day is fetched: history starts on the first run.
 */
export function gapDays(stored: Iterable<string>, firstStored: string | null, now: Date, window = BACKFILL_DAYS): string[] {
  if (!firstStored) return [];
  return missingDays(stored, now, window).filter((day) => day > firstStored);
}
