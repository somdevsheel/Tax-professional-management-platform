import { useCurrentOrganization } from "../lib/hooks";

export function SettingsPage() {
  const org = useCurrentOrganization();

  return (
    <div style={{ maxWidth: 420 }}>
      <h2 style={{ marginBottom: 16, fontSize: 18 }}>Settings</h2>

      <div className="card">
        <strong style={{ fontSize: 14 }}>Firm details</strong>
        <dl style={{ marginTop: 10, fontSize: 13 }}>
          {[
            ["Name", org.data?.name],
            ["Slug", org.data?.slug],
            ["Plan", org.data?.plan],
            ["Status", org.data?.status],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <dt className="muted">{label}</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="muted">Editing firm details lands in a later build phase.</p>
    </div>
  );
}
