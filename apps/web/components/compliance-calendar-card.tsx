"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { useClientComplianceItems, useCompliancePlan, useGenerateCalendar } from "@/lib/hooks";
import {
  COMPLIANCE_CATEGORY_LABELS,
  currentFinancialYear,
  financialYearOptions,
  formatDate,
  groupByCategory,
  isOverdue,
  periodLabel,
} from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  FILED: "bg-green-50 text-green-700",
  VERIFIED: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-50 text-red-700",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

/** A client's compliance calendar: generate a financial year's filings from the statutory due
 *  dates, then see that year's filings in due-date order. */
export function ComplianceCalendarCard({ clientId }: { clientId: string }) {
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const plan = useCompliancePlan(clientId, financialYear);
  const items = useClientComplianceItems(clientId);
  const generate = useGenerateCalendar(clientId);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includePastDue, setIncludePastDue] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preselect the suggested filings whenever a different year's plan loads.
  useEffect(() => {
    if (plan.data) setSelected(new Set(plan.data.filter((p) => p.suggested).map((p) => p.complianceType.id)));
  }, [plan.data]);

  const yearItems = (items.data ?? []).filter((i) => i.financialYear === financialYear);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onGenerate() {
    setError(null);
    setMessage(null);
    try {
      const result = await generate.mutateAsync({ financialYear, complianceTypeIds: [...selected], includePastDue });
      const parts = [`${result.created} filing${result.created === 1 ? "" : "s"} added`];
      if (result.alreadyTracked) parts.push(`${result.alreadyTracked} already tracked`);
      if (result.skippedPastDue) parts.push(`${result.skippedPastDue} past due date skipped`);
      setMessage(parts.join(" · "));
      setPicking(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the calendar.");
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Compliance calendar</h2>
        <div className="flex items-center gap-2">
          <select
            aria-label="Financial year"
            className="input w-auto py-1 text-xs"
            value={financialYear}
            onChange={(e) => {
              setFinancialYear(e.target.value);
              setMessage(null);
            }}
          >
            {financialYearOptions().map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>
          {!picking && (
            <button className="btn-secondary text-xs" onClick={() => setPicking(true)}>
              Generate filings
            </button>
          )}
        </div>
      </div>

      {picking && (
        <div className="card mb-4 space-y-4 p-5">
          <p className="text-sm text-slate-500">
            Filings for FY {financialYear}, using the statutory due dates. Suggestions are based on this client&apos;s
            details — adjust as needed. Due dates stay editable for government extensions.
          </p>
          {groupByCategory(plan.data ?? [], (e) => e.complianceType.category).map(([category, entries]) => (
            <fieldset key={category}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {COMPLIANCE_CATEGORY_LABELS[category] ?? category}
              </legend>
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {entries.map((entry) => (
                  <label key={entry.complianceType.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(entry.complianceType.id)}
                      onChange={() => toggle(entry.complianceType.id)}
                    />
                    <span>
                      {entry.complianceType.name}
                      <span className="block text-xs text-slate-400">
                        {entry.periods === 1 ? "1 filing" : `${entry.periods} filings`}
                        {entry.tracked > 0 ? ` · ${entry.tracked} already tracked` : ""}
                        {entry.reason ? ` · ${entry.reason}` : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includePastDue} onChange={(e) => setIncludePastDue(e.target.checked)} />
            Also add filings whose due date has already passed (marked overdue)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setPicking(false)} disabled={generate.isPending}>
              Cancel
            </button>
            <button className="btn-primary" onClick={onGenerate} disabled={selected.size === 0 || generate.isPending}>
              {generate.isPending ? "Generating…" : `Generate ${selected.size} filing type${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {message && <p className="mb-3 text-sm text-slate-500">{message}</p>}

      {yearItems.length === 0 ? (
        !picking && <p className="text-sm text-slate-400">No filings tracked for FY {financialYear} yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Filing</th>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {yearItems.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-3 text-slate-900">{i.complianceType?.name}</td>
                  <td className="px-5 py-3 text-slate-500">{periodLabel(i.period)}</td>
                  <td className={`px-5 py-3 ${isOverdue(i.dueDate, i.status) ? "font-medium text-red-600" : "text-slate-500"}`}>
                    {formatDate(i.dueDate)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${STATUS_BADGE[i.status]}`}>{i.status.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
