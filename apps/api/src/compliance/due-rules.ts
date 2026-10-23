/**
 * Statutory due-date rules for the seeded compliance catalog, and expansion of a rule into the
 * concrete filings for one financial year.
 *
 * These are the *default* statutory dates. The government regularly extends them (CBDT/CBIC
 * notifications), and some depend on facts this app doesn't model (e.g. ITR is 31 Oct rather
 * than 31 Jul for audit cases; GSTR-3B is the 22nd/24th for QRMP filers) — every generated
 * item's due date stays editable for exactly that reason.
 */

/** "monthly": one filing per FY month, due on `day` of the following month.
 *  "fixed": the listed filings, each due on month/day of the FY's start year (yearOffset 0) or
 *  end year (yearOffset 1). */
export type DueRule =
  | { kind: "monthly"; day: number }
  | { kind: "fixed"; dates: Array<{ period: string; month: number; day: number; yearOffset: 0 | 1 }> };

export const DEFAULT_DUE_RULES: Record<string, DueRule> = {
  GSTR1: { kind: "monthly", day: 11 },
  GSTR3B: { kind: "monthly", day: 20 },
  PF_RETURN: { kind: "monthly", day: 15 },
  ESI_RETURN: { kind: "monthly", day: 15 },
  GSTR9: { kind: "fixed", dates: [{ period: "ANNUAL", month: 12, day: 31, yearOffset: 1 }] },
  ITR: { kind: "fixed", dates: [{ period: "ANNUAL", month: 7, day: 31, yearOffset: 1 }] },
  ADVANCE_TAX: {
    kind: "fixed",
    dates: [
      { period: "Q1", month: 6, day: 15, yearOffset: 0 },
      { period: "Q2", month: 9, day: 15, yearOffset: 0 },
      { period: "Q3", month: 12, day: 15, yearOffset: 0 },
      { period: "Q4", month: 3, day: 15, yearOffset: 1 },
    ],
  },
  TDS_24Q: { kind: "fixed", dates: tdsQuarters() },
  TDS_26Q: { kind: "fixed", dates: tdsQuarters() },
  // Companies Act: AOC-4 within 30 days and MGT-7 within 60 days of the AGM, which is due by
  // 30 Sep — so 30 Oct and 29 Nov when the AGM is held on the last permitted day.
  AOC4: { kind: "fixed", dates: [{ period: "ANNUAL", month: 10, day: 30, yearOffset: 1 }] },
  MGT7: { kind: "fixed", dates: [{ period: "ANNUAL", month: 11, day: 29, yearOffset: 1 }] },
};

function tdsQuarters(): Array<{ period: string; month: number; day: number; yearOffset: 0 | 1 }> {
  return [
    { period: "Q1", month: 7, day: 31, yearOffset: 0 },
    { period: "Q2", month: 10, day: 31, yearOffset: 0 },
    { period: "Q3", month: 1, day: 31, yearOffset: 1 },
    { period: "Q4", month: 5, day: 31, yearOffset: 1 },
  ];
}

/** Parses an Indian financial year like "2025-26" into its start year, or null if malformed
 *  (including a mismatched suffix like "2025-27"). */
export function parseFinancialYear(fy: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!match) return null;
  const start = Number(match[1]);
  return (start + 1) % 100 === Number(match[2]) ? start : null;
}

/** The assessment year that follows a financial year ("2025-26" → "2026-27"). */
export function assessmentYearFor(fy: string): string | null {
  const start = parseFinancialYear(fy);
  return start === null ? null : `${start + 1}-${String((start + 2) % 100).padStart(2, "0")}`;
}

/** Concrete filings a rule produces for a financial year, as UTC-midnight due dates. */
export function expandRule(rule: DueRule, financialYear: string): Array<{ period: string; dueDate: Date }> {
  const start = parseFinancialYear(financialYear);
  if (start === null) throw new Error(`Invalid financial year "${financialYear}"`);

  if (rule.kind === "monthly") {
    const out: Array<{ period: string; dueDate: Date }> = [];
    for (let i = 0; i < 12; i++) {
      const periodMonth = ((3 + i) % 12) + 1; // Apr..Mar
      const periodYear = periodMonth >= 4 ? start : start + 1;
      const dueMonth = (periodMonth % 12) + 1;
      const dueYear = periodMonth === 12 ? periodYear + 1 : periodYear;
      out.push({ period: `${periodYear}-${String(periodMonth).padStart(2, "0")}`, dueDate: utcDay(dueYear, dueMonth, rule.day) });
    }
    return out;
  }
  return rule.dates.map((d) => ({ period: d.period, dueDate: utcDay(start + d.yearOffset, d.month, d.day) }));
}

/** UTC midnight of year/month/day, clamping the day to the month's length (a "31st" rule in a
 *  30-day month means the 30th, not the 1st of the next month). */
function utcDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

/** Catalog codes that apply to a client by default, inferred from what's on file for them. The
 *  user can always add or remove types before generating — this is a starting point. */
export function suggestedTypeCodes(client: { entityType: string; gstin: string | null; tan: string | null }): Map<string, string> {
  const suggestions = new Map<string, string>();
  suggestions.set("ITR", "Every assessee files an income tax return");
  suggestions.set("ADVANCE_TAX", "Applies when estimated tax liability is ₹10,000 or more");
  if (client.gstin) {
    for (const code of ["GSTR1", "GSTR3B", "GSTR9"]) suggestions.set(code, "Client has a GSTIN on file");
  }
  if (client.tan) {
    for (const code of ["TDS_24Q", "TDS_26Q"]) suggestions.set(code, "Client has a TAN on file");
  }
  if (client.entityType === "PRIVATE_LIMITED" || client.entityType === "PUBLIC_LIMITED") {
    for (const code of ["AOC4", "MGT7"]) suggestions.set(code, "Companies file annual ROC returns");
  }
  return suggestions;
}
