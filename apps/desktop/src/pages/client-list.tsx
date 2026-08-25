import { useState } from "react";
import { Link } from "react-router-dom";
import { useClients } from "../lib/hooks";

export function ClientListPage() {
  const [search, setSearch] = useState("");
  const clients = useClients(search);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Clients</h2>
      </div>
      <input
        className="input"
        placeholder="Search client, GSTIN, PAN…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 320 }}
      />
      <div className="card" style={{ padding: 8 }}>
        {clients.isLoading && <p className="muted" style={{ padding: 12 }}>Loading…</p>}
        {clients.data?.data.length === 0 && <p className="muted" style={{ padding: 12 }}>No clients found.</p>}
        {clients.data?.data.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="list-row">
            <span>{c.name}</span>
            <span className="badge">{c.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
