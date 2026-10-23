import { assessmentYearFor, DEFAULT_DUE_RULES, expandRule, parseFinancialYear, suggestedTypeCodes } from "./due-rules";
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
    expect(iso(expandRule(DEFAULT_DUE_RULES.GSTR9, "2025-26")[0].dueDate)).toBe("2026-12-31");
  });

  it("clamps a day past the end of the month instead of rolling into the next month", () => {
    const items = expandRule({ kind: "monthly", day: 31 }, "2025-26");
    expect(iso(items.find((i) => i.period === "2026-01")!.dueDate)).toBe("2026-02-28");
  });

  it("suggests filings from what's on file for the client", () => {
    expect([...suggestedTypeCodes({ entityType: "INDIVIDUAL", gstin: null, tan: null }).keys()].sort()).toEqual(["ADVANCE_TAX", "ITR"]);
    const company = suggestedTypeCodes({ entityType: "PRIVATE_LIMITED", gstin: "27AAACM1234K1Z5", tan: "MUMA12345B" });
    expect([...company.keys()].sort()).toEqual(["ADVANCE_TAX", "AOC4", "GSTR1", "GSTR3B", "GSTR9", "ITR", "MGT7", "TDS_24Q", "TDS_26Q"]);
  });

  it("treats the IST calendar day as 'today', not the UTC one", () => {
    // 20:00 UTC on 30 Jul is already 31 Jul in India.
    expect(iso(startOfTodayIst(new Date("2026-07-30T20:00:00Z")))).toBe("2026-07-31");
    expect(iso(startOfTodayIst(new Date("2026-07-31T10:00:00Z")))).toBe("2026-07-31");
  });
});
