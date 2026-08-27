export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="card" style={{ maxWidth: 480, margin: "40px auto", padding: 32, textAlign: "center" }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
      <p className="muted" style={{ marginTop: 8 }}>{description}</p>
      <p className="muted" style={{ marginTop: 16, fontSize: 11 }}>
        The database schema is already in place — this module lands in the next build phase.
      </p>
    </div>
  );
}
