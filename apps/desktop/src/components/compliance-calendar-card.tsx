import { useEffect, useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { useClientComplianceItems, useCompliancePlan, useGenerateCalendar } from "../lib/hooks";
import { currentFinancialYear, financialYearOptions, formatDate, isOverdue, periodLabel } from "../lib/format";

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
    <div style={{ marginBottom: 20 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.03em", margin: 0 }}>
          Compliance calendar
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            className="input"
            style={{ width: "auto", marginBottom: 0, padding: "4px 8px", fontSize: 12 }}
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
            <button className="btn btn-secondary" onClick={() => setPicking(true)}>
              Generate filings
            </button>
          )}
        </div>
      </div>

      {picking && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Filings for FY {financialYear}, using the statutory due dates. Suggestions are based on this client's details —
            adjust as needed. Due dates stay editable for government extensions.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 16px", marginBottom: 12 }}>
            {(plan.data ?? []).map((entry) => (
              <label key={entry.complianceType.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selected.has(entry.complianceType.id)}
                  onChange={() => toggle(entry.complianceType.id)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  {entry.complianceType.name}
                  <span className="muted" style={{ display: "block", fontSize: 11 }}>
                    {entry.periods === 1 ? "1 filing" : `${entry.periods} filings`}
                    {entry.tracked > 0 ? ` · ${entry.tracked} already tracked` : ""}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={includePastDue} onChange={(e) => setIncludePastDue(e.target.checked)} />
            Also add filings whose due date has already passed (marked overdue)
          </label>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setPicking(false)} disabled={generate.isPending}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onGenerate} disabled={selected.size === 0 || generate.isPending}>
              {generate.isPending ? "Generating…" : `Generate ${selected.size} filing type${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {message && <p className="muted" style={{ margin: "0 0 10px" }}>{message}</p>}

      {yearItems.length === 0 ? (
        !picking && <p className="muted">No filings tracked for FY {financialYear} yet.</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Filing</th>
                <th>Period</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {yearItems.map((i) => (
                <tr key={i.id}>
                  <td>{i.complianceType?.name}</td>
                  <td className="muted">{periodLabel(i.period)}</td>
                  <td style={isOverdue(i.dueDate, i.status) ? { color: "#dc2626", fontWeight: 500 } : undefined}>
                    {formatDate(i.dueDate)}
                  </td>
                  <td>
                    <span className="badge">{i.status.replace(/_/g, " ")}</span>
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
