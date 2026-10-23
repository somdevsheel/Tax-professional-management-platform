/**
 * The compliance catalog: every recurring statutory filing this app can put on a client's
 * calendar, with its default due-date rule — and the expansion of a rule into the concrete
 * filings for one financial year. prisma/seed.ts seeds `compliance_types` from this list.
 *
 * Only filings with a fixed calendar due date belong here. Event-driven forms (MGT-14 within 30
 * days of a resolution, DIR-12 on a director change, BEN-2, INC-22A, PAS-3…) have no date to
 * generate ahead of time; they're tracked by hand with "Track a filing".
 *
 * These are the *default* statutory dates. The government regularly extends them (CBDT/CBIC/MCA
 * notifications), and some depend on facts this app doesn't model (QRMP GSTR-3B is the 22nd or
 * 24th depending on the state; ADT-1/AOC-4/MGT-7 run from the actual AGM date). Every generated
 * item's due date stays editable for exactly that reason.
 */

/** "monthly": one filing per FY month (optionally only `periodMonths`), due on `day` of the
 *  following month — `exceptions` override the day for specific period months.
 *  "fixed": the listed filings, each due on month/day of the FY's start year (yearOffset 0) or
 *  end year (yearOffset 1). */
export type DueRule =
  | {
      kind: "monthly";
      day: number;
      periodMonths?: number[];
      exceptions?: Array<{ periodMonth: number; day: number }>;
    }
  | { kind: "fixed"; dates: Array<{ period: string; month: number; day: number; yearOffset: 0 | 1 }> };

export interface CatalogEntry {
  code: string;
  name: string;
  category: "GST" | "INCOME_TAX" | "TDS" | "MCA" | "PF_ESI";
  periodicity: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL";
  rule: DueRule;
}

type FixedDate = { period: string; month: number; day: number; yearOffset: 0 | 1 };

const annual = (month: number, day: number, yearOffset: 0 | 1 = 1): DueRule => ({
  kind: "fixed",
  dates: [{ period: "ANNUAL", month, day, yearOffset }],
});

/** Due on `day` of the month after each quarter ends (Jul, Oct, Jan, Apr). */
const afterQuarter = (day: number): DueRule => ({
  kind: "fixed",
  dates: [
    { period: "Q1", month: 7, day, yearOffset: 0 },
    { period: "Q2", month: 10, day, yearOffset: 0 },
    { period: "Q3", month: 1, day, yearOffset: 1 },
    { period: "Q4", month: 4, day, yearOffset: 1 },
  ],
});

/** Quarterly with explicit (month, day) per quarter, Q1..Q4, for the irregular ones. Q1/Q2 fall
 *  in the FY's start year and Q4 always in its end year (even a June date: Form 16A's Q4 is
 *  15 Jun of the *next* year); Q3 depends on the month (15 Dec stays, 31 Jan moves on). */
const quarters = (q1: [number, number], q2: [number, number], q3: [number, number], q4: [number, number]): DueRule => ({
  kind: "fixed",
  dates: [q1, q2, q3, q4].map(([month, day], i): FixedDate => {
    const yearOffset = i < 2 ? 0 : i === 3 ? 1 : month >= 4 ? 0 : 1;
    return { period: `Q${i + 1}`, month, day, yearOffset };
  }),
});

// TDS/TCS returns: Q4 is due 31 May (not April) to give time after year-end.
const TDS_RETURN = quarters([7, 31], [10, 31], [1, 31], [5, 31]);

export const COMPLIANCE_CATALOG: CatalogEntry[] = [
  // ---- GST ----
  { code: "GSTR1", name: "GSTR-1 (Monthly)", category: "GST", periodicity: "MONTHLY", rule: { kind: "monthly", day: 11 } },
  { code: "GSTR1_QRMP", name: "GSTR-1 (Quarterly, QRMP)", category: "GST", periodicity: "QUARTERLY", rule: afterQuarter(13) },
  { code: "GSTR3B", name: "GSTR-3B (Monthly)", category: "GST", periodicity: "MONTHLY", rule: { kind: "monthly", day: 20 } },
  // 22nd for category-X states, 24th for category-Y — the earlier date is the safe default.
  { code: "GSTR3B_QRMP", name: "GSTR-3B (Quarterly, QRMP — 22nd/24th by state)", category: "GST", periodicity: "QUARTERLY", rule: afterQuarter(22) },
  {
    code: "PMT06",
    name: "PMT-06 (QRMP monthly tax payment)",
    category: "GST",
    periodicity: "MONTHLY",
    rule: { kind: "monthly", day: 25, periodMonths: [4, 5, 7, 8, 10, 11, 1, 2] },
  },
  { code: "CMP08", name: "CMP-08 (Composition quarterly statement)", category: "GST", periodicity: "QUARTERLY", rule: afterQuarter(18) },
  { code: "GSTR4", name: "GSTR-4 (Composition annual return)", category: "GST", periodicity: "ANNUAL", rule: annual(6, 30) },
  { code: "GSTR7", name: "GSTR-7 (TDS under GST)", category: "GST", periodicity: "MONTHLY", rule: { kind: "monthly", day: 10 } },
  { code: "GSTR8", name: "GSTR-8 (TCS by e-commerce operator)", category: "GST", periodicity: "MONTHLY", rule: { kind: "monthly", day: 10 } },
  { code: "GSTR9", name: "GSTR-9 (Annual return)", category: "GST", periodicity: "ANNUAL", rule: annual(12, 31) },
  { code: "GSTR9C", name: "GSTR-9C (Reconciliation statement)", category: "GST", periodicity: "ANNUAL", rule: annual(12, 31) },

  // ---- Income tax ----
  { code: "ITR", name: "ITR — non-audit cases", category: "INCOME_TAX", periodicity: "ANNUAL", rule: annual(7, 31) },
  { code: "ITR_AUDIT", name: "ITR — audit cases & companies", category: "INCOME_TAX", periodicity: "ANNUAL", rule: annual(10, 31) },
  { code: "ITR_TP", name: "ITR — transfer pricing cases", category: "INCOME_TAX", periodicity: "ANNUAL", rule: annual(11, 30) },
  { code: "TAX_AUDIT", name: "Tax audit report (Form 3CA/3CB-3CD)", category: "INCOME_TAX", periodicity: "ANNUAL", rule: annual(9, 30) },
  { code: "FORM_3CEB", name: "Transfer pricing report (Form 3CEB)", category: "INCOME_TAX", periodicity: "ANNUAL", rule: annual(10, 31) },
  {
    code: "ADVANCE_TAX",
    name: "Advance tax instalment",
    category: "INCOME_TAX",
    periodicity: "QUARTERLY",
    rule: quarters([6, 15], [9, 15], [12, 15], [3, 15]),
  },
  { code: "SFT", name: "SFT — Form 61A (financial transactions)", category: "INCOME_TAX", periodicity: "ANNUAL", rule: annual(5, 31) },

  // ---- TDS / TCS ----
  {
    code: "TDS_PAYMENT",
    name: "TDS/TCS deposit (Challan 281)",
    category: "TDS",
    periodicity: "MONTHLY",
    // 7th of the next month — except tax deducted in March, due 30 April.
    rule: { kind: "monthly", day: 7, exceptions: [{ periodMonth: 3, day: 30 }] },
  },
  { code: "TDS_24Q", name: "TDS return — Form 24Q (Salary)", category: "TDS", periodicity: "QUARTERLY", rule: TDS_RETURN },
  { code: "TDS_26Q", name: "TDS return — Form 26Q (Non-salary)", category: "TDS", periodicity: "QUARTERLY", rule: TDS_RETURN },
  { code: "TDS_27Q", name: "TDS return — Form 27Q (Non-residents)", category: "TDS", periodicity: "QUARTERLY", rule: TDS_RETURN },
  { code: "TCS_27EQ", name: "TCS return — Form 27EQ", category: "TDS", periodicity: "QUARTERLY", rule: quarters([7, 15], [10, 15], [1, 15], [5, 15]) },
  { code: "FORM16", name: "Form 16 (Salary TDS certificate)", category: "TDS", periodicity: "ANNUAL", rule: annual(6, 15) },
  { code: "FORM16A", name: "Form 16A (Non-salary TDS certificate)", category: "TDS", periodicity: "QUARTERLY", rule: quarters([8, 15], [11, 15], [2, 15], [6, 15]) },

  // ---- MCA — companies (dates assume the AGM is held on its last permitted day, 30 Sep) ----
  { code: "AGM", name: "Annual General Meeting", category: "MCA", periodicity: "ANNUAL", rule: annual(9, 30) },
  { code: "ADT1", name: "ADT-1 (Auditor appointment, 15 days from AGM)", category: "MCA", periodicity: "ANNUAL", rule: annual(10, 15) },
  { code: "AOC4", name: "AOC-4 (Financial statements, 30 days from AGM)", category: "MCA", periodicity: "ANNUAL", rule: annual(10, 30) },
  { code: "AOC4_CFS", name: "AOC-4 CFS (Consolidated financial statements)", category: "MCA", periodicity: "ANNUAL", rule: annual(10, 30) },
  { code: "MGT7", name: "MGT-7 / MGT-7A (Annual return, 60 days from AGM)", category: "MCA", periodicity: "ANNUAL", rule: annual(11, 29) },
  { code: "DPT3", name: "DPT-3 (Return of deposits / outstanding loans)", category: "MCA", periodicity: "ANNUAL", rule: annual(6, 30) },
  { code: "DIR3_KYC", name: "DIR-3 KYC (Director / designated partner KYC)", category: "MCA", periodicity: "ANNUAL", rule: annual(9, 30) },
  {
    code: "MSME1",
    name: "MSME-1 (Dues to MSME suppliers, half-yearly)",
    category: "MCA",
    periodicity: "HALF_YEARLY",
    rule: {
      kind: "fixed",
      dates: [
        { period: "H1", month: 10, day: 31, yearOffset: 0 },
        { period: "H2", month: 4, day: 30, yearOffset: 1 },
      ],
    },
  },
  // ---- MCA — LLPs ----
  { code: "LLP_FORM11", name: "LLP Form 11 (Annual return)", category: "MCA", periodicity: "ANNUAL", rule: annual(5, 30) },
  { code: "LLP_FORM8", name: "LLP Form 8 (Statement of account & solvency)", category: "MCA", periodicity: "ANNUAL", rule: annual(10, 30) },

  // ---- PF / ESI ----
  { code: "PF_RETURN", name: "PF return & payment (ECR)", category: "PF_ESI", periodicity: "MONTHLY", rule: { kind: "monthly", day: 15 } },
  { code: "ESI_RETURN", name: "ESI contribution", category: "PF_ESI", periodicity: "MONTHLY", rule: { kind: "monthly", day: 15 } },
];

export const DEFAULT_DUE_RULES: Record<string, DueRule> = Object.fromEntries(COMPLIANCE_CATALOG.map((e) => [e.code, e.rule]));

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
      if (rule.periodMonths && !rule.periodMonths.includes(periodMonth)) continue;
      const periodYear = periodMonth >= 4 ? start : start + 1;
      const dueMonth = (periodMonth % 12) + 1;
      const dueYear = periodMonth === 12 ? periodYear + 1 : periodYear;
      const day = rule.exceptions?.find((e) => e.periodMonth === periodMonth)?.day ?? rule.day;
      out.push({ period: `${periodYear}-${String(periodMonth).padStart(2, "0")}`, dueDate: utcDay(dueYear, dueMonth, day) });
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

const COMPANIES = new Set(["PRIVATE_LIMITED", "PUBLIC_LIMITED"]);

/** Catalog codes that apply to a client by default, inferred from what's on file for them. The
 *  user can always add or remove types before generating — this is a starting point, and
 *  deliberately conservative: anything that hinges on facts we don't store (turnover for tax
 *  audit/GSTR-9C, QRMP or composition scheme, MSME dues, deposits beyond loans, PF/ESI headcount)
 *  is left for the user to tick. */
export function suggestedTypeCodes(client: { entityType: string; gstin: string | null; tan: string | null }): Map<string, string> {
  const suggestions = new Map<string, string>();
  const isCompany = COMPANIES.has(client.entityType);
  const isLlp = client.entityType === "LLP";

  if (isCompany) {
    suggestions.set("ITR_AUDIT", "Companies file by 31 October (accounts are always audited)");
  } else {
    suggestions.set("ITR", "Every assessee files an income tax return");
  }
  suggestions.set("ADVANCE_TAX", "Applies when estimated tax liability is ₹10,000 or more");

  if (client.gstin) {
    for (const code of ["GSTR1", "GSTR3B", "GSTR9"]) suggestions.set(code, "Client has a GSTIN on file");
  }
  if (client.tan) {
    for (const code of ["TDS_PAYMENT", "TDS_24Q", "TDS_26Q", "FORM16", "FORM16A"]) suggestions.set(code, "Client has a TAN on file");
  }
  if (isCompany) {
    for (const code of ["AGM", "AOC4", "MGT7"]) suggestions.set(code, "Annual filings every company makes");
    suggestions.set("DPT3", "Every company files DPT-3 for outstanding loans/deposits");
    suggestions.set("DIR3_KYC", "Every director with a DIN");
  }
  if (isLlp) {
    for (const code of ["LLP_FORM11", "LLP_FORM8"]) suggestions.set(code, "Annual filings every LLP makes");
    suggestions.set("DIR3_KYC", "Every designated partner with a DIN");
  }
  return suggestions;
}
