import { usePortalCatalog } from "../lib/hooks";

export function PortalsPage() {
  const catalog = usePortalCatalog();

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Portals</h2>
          <p className="muted" style={{ marginTop: 2 }}>
            The platform-wide catalog. Link a portal from a client&apos;s page to store credentials.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {(catalog.data ?? []).map((portal) => (
          <div key={portal.id} className="card">
            <strong style={{ fontSize: 14 }}>{portal.name}</strong>
            <p className="muted" style={{ margin: "2px 0 0" }}>{portal.category.replace(/_/g, " ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
