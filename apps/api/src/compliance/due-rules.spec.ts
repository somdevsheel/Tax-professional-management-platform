import { assessmentYearFor, COMPLIANCE_CATALOG, DEFAULT_DUE_RULES, expandRule, parseFinancialYear, suggestedTypeCodes } from "./due-rules";
import { startOfTodayIst } from "../common/dates";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("compliance due rules", () => {
  it("parses financial years and rejects mismatched ones", () => {
    expect(parseFinancialYear("2025-26")).toBe(2025);
    expect(parseFinancialYear("2099-00")).toBe(2099);
    expect(parseFinancialYear("2025-27")).toBeNull();
    expect(parseFinancialYear("FY2025")).toBeNull();
    expect(assessmentYearFor("2025-26")).toBe("2026-27");
  });

  it("expands a monthly rule into twelve filings due the month after each FY month", () => {
    const items = expandRule(DEFAULT_DUE_RULES.GSTR3B, "2025-26");
    expect(items).toHaveLength(12);
    expect(items[0]).toEqual({ period: "2025-04", dueDate: new Date("2025-05-20") });
    expect(items[8]).toEqual({ period: "2025-12", dueDate: new Date("2026-01-20") });
    expect(items[11]).toEqual({ period: "2026-03", dueDate: new Date("2026-04-20") });
  });

  it("puts TDS and advance-tax quarters in the right calendar years", () => {
    expect(expandRule(DEFAULT_DUE_RULES.TDS_26Q, "2025-26").map((i) => [i.period, iso(i.dueDate)])).toEqual([
      ["Q1", "2025-07-31"],
      ["Q2", "2025-10-31"],
      ["Q3", "2026-01-31"],
      ["Q4", "2026-05-31"],
    ]);
    expect(expandRule(DEFAULT_DUE_RULES.ADVANCE_TAX, "2025-26").map((i) => iso(i.dueDate))).toEqual([
      "2025-06-15",
      "2025-09-15",
      "2025-12-15",
      "2026-03-15",
    ]);
    expect(iso(expandRule(DEFAULT_DUE_RULES.ITR, "2025-26")[0].dueDate)).toBe("2026-07-31");
    expect(iso(expandRule(DEFAULT_DUE_RULES.ITR_AUDIT, "2025-26")[0].dueDate)).toBe("2026-10-31");
    expect(iso(expandRule(DEFAULT_DUE_RULES.GSTR9, "2025-26")[0].dueDate)).toBe("2026-12-31");
  });

  it("clamps a day past the end of the month instead of rolling into the next month", () => {
    const items = expandRule({ kind: "monthly", day: 31 }, "2025-26");
    expect(iso(items.find((i) => i.period === "2026-01")!.dueDate)).toBe("2026-02-28");
  });

  it("suggests filings from what's on file for the client", () => {
    const keys = (c: Parameters<typeof suggestedTypeCodes>[0]) => [...suggestedTypeCodes(c).keys()].sort();
    expect(keys({ entityType: "INDIVIDUAL", gstin: null, tan: null })).toEqual(["ADVANCE_TAX", "ITR"]);
    expect(keys({ entityType: "PRIVATE_LIMITED", gstin: "27AAACM1234K1Z5", tan: "MUMA12345B" })).toEqual([
      "ADVANCE_TAX", "AGM", "AOC4", "DIR3_KYC", "DPT3", "FORM16", "FORM16A", "GSTR1", "GSTR3B", "GSTR9",
      "ITR_AUDIT", "MGT7", "TDS_24Q", "TDS_26Q", "TDS_PAYMENT",
    ]);
    // LLPs file Form 11/8 on MCA, not the company forms.
    expect(keys({ entityType: "LLP", gstin: null, tan: null })).toEqual(["ADVANCE_TAX", "DIR3_KYC", "ITR", "LLP_FORM11", "LLP_FORM8"]);
  });

  it("only ever suggests codes that exist in the catalog", () => {
    const codes = new Set(COMPLIANCE_CATALOG.map((e) => e.code));
    for (const entityType of ["INDIVIDUAL", "LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED", "PARTNERSHIP"]) {
      for (const code of suggestedTypeCodes({ entityType, gstin: "X", tan: "Y" }).keys()) expect(codes).toContain(code);
    }
    expect(codes.size).toBe(COMPLIANCE_CATALOG.length); // no duplicate codes
  });

  it("treats the IST calendar day as 'today', not the UTC one", () => {
    // 20:00 UTC on 30 Jul is already 31 Jul in India.
    expect(iso(startOfTodayIst(new Date("2026-07-30T20:00:00Z")))).toBe("2026-07-31");
    expect(iso(startOfTodayIst(new Date("2026-07-31T10:00:00Z")))).toBe("2026-07-31");
  });

  /** The whole catalog's statutory default dates for FY 2025-26, pinned so a change to any rule
   *  is a deliberate, reviewed edit to this table. */
  const EXPECTED_FY_2025_26: Record<string, string[]> = {
    GSTR1: monthlyOn(11),
    GSTR1_QRMP: ["2025-07-13", "2025-10-13", "2026-01-13", "2026-04-13"],
    GSTR3B: monthlyOn(20),
    GSTR3B_QRMP: ["2025-07-22", "2025-10-22", "2026-01-22", "2026-04-22"],
    PMT06: ["2025-05-25", "2025-06-25", "2025-08-25", "2025-09-25", "2025-11-25", "2025-12-25", "2026-02-25", "2026-03-25"],
    CMP08: ["2025-07-18", "2025-10-18", "2026-01-18", "2026-04-18"],
    GSTR4: ["2026-06-30"],
    GSTR7: monthlyOn(10),
    GSTR8: monthlyOn(10),
    GSTR9: ["2026-12-31"],
    GSTR9C: ["2026-12-31"],
    ITR: ["2026-07-31"],
    ITR_AUDIT: ["2026-10-31"],
    ITR_TP: ["2026-11-30"],
    TAX_AUDIT: ["2026-09-30"],
    FORM_3CEB: ["2026-10-31"],
    ADVANCE_TAX: ["2025-06-15", "2025-09-15", "2025-12-15", "2026-03-15"],
    SFT: ["2026-05-31"],
    TDS_PAYMENT: [...monthlyOn(7).slice(0, 11), "2026-04-30"],
    TDS_24Q: ["2025-07-31", "2025-10-31", "2026-01-31", "2026-05-31"],
    TDS_26Q: ["2025-07-31", "2025-10-31", "2026-01-31", "2026-05-31"],
    TDS_27Q: ["2025-07-31", "2025-10-31", "2026-01-31", "2026-05-31"],
    TCS_27EQ: ["2025-07-15", "2025-10-15", "2026-01-15", "2026-05-15"],
    FORM16: ["2026-06-15"],
    FORM16A: ["2025-08-15", "2025-11-15", "2026-02-15", "2026-06-15"],
    AGM: ["2026-09-30"],
    ADT1: ["2026-10-15"],
    AOC4: ["2026-10-30"],
    AOC4_CFS: ["2026-10-30"],
    MGT7: ["2026-11-29"],
    DPT3: ["2026-06-30"],
    DIR3_KYC: ["2026-09-30"],
    MSME1: ["2025-10-31", "2026-04-30"],
    LLP_FORM11: ["2026-05-30"],
    LLP_FORM8: ["2026-10-30"],
    PF_RETURN: monthlyOn(15),
    ESI_RETURN: monthlyOn(15),
  };

  function monthlyOn(day: number): string[] {
    // Apr 2025 … Mar 2026 periods, each due the following month.
    return ["2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"].map(
      (m) => `${m}-${String(day).padStart(2, "0")}`,
    );
  }

  it.each(COMPLIANCE_CATALOG.map((e) => [e.code, e] as const))("%s has the statutory due dates for FY 2025-26", (code, entry) => {
    expect(expandRule(entry.rule, "2025-26").map((i) => iso(i.dueDate))).toEqual(EXPECTED_FY_2025_26[code]);
  });

  it("pins every catalog entry above (adding a filing type means adding its dates here)", () => {
    expect(Object.keys(EXPECTED_FY_2025_26).sort()).toEqual(COMPLIANCE_CATALOG.map((e) => e.code).sort());
  });

  it("never puts a return's due date before the period it covers has ended", () => {
    for (const entry of COMPLIANCE_CATALOG) {
      if (entry.code === "ADVANCE_TAX") continue; // paid during the quarter by design
      for (const { period, dueDate } of expandRule(entry.rule, "2025-26")) {
        const periodEnd =
          /^\d{4}-\d{2}$/.test(period) ? new Date(`${period}-01`) // monthly: due after the month starts…
          : period === "Q1" ? new Date("2025-06-30")
          : period === "Q2" || period === "H1" ? new Date("2025-09-30")
          : period === "Q3" ? new Date("2025-12-31")
          : new Date("2026-03-31"); // Q4, H2, ANNUAL
        if (/^\d{4}-\d{2}$/.test(period)) {
          // …and specifically in a later calendar month.
          expect(iso(dueDate).slice(0, 7) > period).toBe(true);
        } else {
          expect(dueDate.getTime()).toBeGreaterThan(periodEnd.getTime());
        }
      }
    }
  });
});
