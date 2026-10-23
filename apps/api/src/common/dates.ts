/**
 * Due dates are calendar days, stored as UTC midnight of that day (what `new Date("2026-07-31")`
 * produces, and what the web/desktop date pickers send). Comparing one against `new Date()`
 * directly is wrong for an Indian firm: UTC midnight of the 31st is 05:30 IST on the 31st, so a
 * filing would show as overdue for most of its own due date. Compare against the *IST calendar
 * day* instead, expressed the same way (UTC midnight of that day).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of today's date in India. A due date is overdue iff it is before this. */
export function startOfTodayIst(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Whole calendar days from `from` to `to` (both UTC-midnight day values). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
