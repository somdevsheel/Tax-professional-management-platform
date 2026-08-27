import { useState } from "react";
import { Link } from "react-router-dom";
import { useClients } from "../lib/hooks";

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDED"];

export function ClientListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const clients = useClients({ search, status });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Clients</h2>
          <p className="muted" style={{ margin: "2px 0 0" }}>{clients.data?.meta?.total ?? 0} total</p>
        </div>
        <Link to="/clients/new" className="btn btn-primary">
          New client
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Search name, PAN, GSTIN, TAN, CIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320, marginBottom: 0 }}
        />
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ maxWidth: 170, marginBottom: 0 }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Entity type</th>
              <th>PAN / GSTIN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.isLoading && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Loading…
                </td>
              </tr>
            )}
            {clients.data?.data.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  No clients match your filters.
                </td>
              </tr>
            )}
            {clients.data?.data.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/clients/${c.id}`} style={{ fontWeight: 500, color: "#0f172a", textDecoration: "none" }}>
                    {c.name}
                  </Link>
                </td>
                <td className="muted">{c.entityType.replace(/_/g, " ")}</td>
                <td className="muted">{c.pan || c.gstin || "—"}</td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
