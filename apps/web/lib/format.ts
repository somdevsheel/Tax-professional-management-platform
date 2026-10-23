export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function humanizeEntityType(entityType: string): string {
  return entityType
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

/** Today's calendar date in the user's timezone, as YYYY-MM-DD. */
export function todayIsoDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** A due date is a calendar day: it's overdue only once that day has passed, not from the
 *  moment it starts (comparing Date objects marked filings overdue on their own due date). */
export function isOverdue(dueDate: string, status: string): boolean {
  const open = status !== "FILED" && status !== "VERIFIED" && status !== "NOT_APPLICABLE";
  return open && dueDate.slice(0, 10) < todayIsoDate();
}

/** The Indian financial year containing today ("2026-27" from April 2026 to March 2027). */
export function currentFinancialYear(now: Date = new Date()): string {
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return financialYearFrom(start);
}

export function financialYearFrom(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Previous, current and next financial year — the useful range for generating a calendar. */
export function financialYearOptions(): string[] {
  const current = Number(currentFinancialYear().slice(0, 4));
  return [current - 1, current, current + 1].map(financialYearFrom);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-09" → "Sep 2025", "Q2" → "Q2", "ANNUAL"/null → "Annual"/"—". */
export function periodLabel(period: string | null): string {
  if (!period) return "—";
  const monthly = /^(\d{4})-(\d{2})$/.exec(period);
  if (monthly) return `${MONTHS[Number(monthly[2]) - 1]} ${monthly[1]}`;
  return period === "ANNUAL" ? "Annual" : period;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
