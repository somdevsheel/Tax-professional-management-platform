import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@tax-platform/api-client";
import { ENTITY_TYPES } from "@tax-platform/types";
import { useCreateClient } from "../lib/hooks";

export function ClientNewPage() {
  const navigate = useNavigate();
  const createClient = useCreateClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    entityType: "PRIVATE_LIMITED",
    pan: "",
    gstin: "",
    tan: "",
    cin: "",
    email: "",
    phone: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const client = await createClient.mutateAsync({
        name: form.name,
        entityType: form.entityType,
        pan: form.pan || undefined,
        gstin: form.gstin || undefined,
        tan: form.tan || undefined,
        cin: form.cin || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      navigate(`/clients/${client.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create client.");
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ marginBottom: 16, fontSize: 18 }}>New client</h2>
      <form onSubmit={onSubmit} className="card">
        <input required className="input" placeholder="Client name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <select className="input" value={form.entityType} onChange={(e) => set("entityType", e.target.value)}>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input className="input" placeholder="PAN" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
          <input className="input" placeholder="GSTIN" value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
          <input className="input" placeholder="TAN" value={form.tan} onChange={(e) => set("tan", e.target.value.toUpperCase())} />
          <input className="input" placeholder="CIN" value={form.cin} onChange={(e) => set("cin", e.target.value.toUpperCase())} />
          <input type="email" className="input" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={createClient.isPending}>
            {createClient.isPending ? "Creating…" : "Create client"}
          </button>
        </div>
      </form>
    </div>
  );
}
