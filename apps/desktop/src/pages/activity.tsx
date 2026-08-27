import { useState } from "react";
import { useAuditLog } from "../lib/hooks";
import { formatDateTime } from "../lib/format";

const RESOURCE_TYPES = ["client", "credential", "organization_member", "portal_session"];

function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function ActivityPage() {
  const [resourceType, setResourceType] = useState("");
  const activity = useAuditLog(resourceType ? { resourceType } : undefined);

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: 18 }}>Activity</h2>
        <select className="input" style={{ maxWidth: 200, marginBottom: 0 }} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
          <option value="">All resource types</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Resource</th>
              <th>Result</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(activity.data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  No activity recorded yet.
                </td>
              </tr>
            )}
            {(activity.data?.data ?? []).map((entry) => (
              <tr key={entry.id}>
                <td>{humanizeAction(entry.action)}</td>
                <td className="muted">{entry.resourceType.replace(/_/g, " ")}</td>
                <td>
                  <span
                    className="badge"
                    style={
                      entry.result === "success"
                        ? { background: "#dcfce7", color: "#15803d" }
                        : { background: "#fee2e2", color: "#b91c1c" }
                    }
                  >
                    {entry.result}
                  </span>
                </td>
                <td className="muted">{formatDateTime(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
