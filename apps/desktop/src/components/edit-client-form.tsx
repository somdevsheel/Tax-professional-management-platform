import { useState, type FormEvent } from "react";
import { ApiError, type ClientDetail } from "@tax-platform/api-client";
import { ENTITY_TYPES } from "@tax-platform/types";
import { useUpdateClient } from "../lib/hooks";

const OPTIONAL_FIELDS = [
  "pan",
  "gstin",
  "tan",
  "cin",
  "email",
  "phone",
  "contactPerson",
  "financialYear",
  "assessmentYear",
  "notes",
] as const;
type OptionalField = (typeof OPTIONAL_FIELDS)[number];

const UPPERCASE: ReadonlySet<OptionalField> = new Set(["pan", "gstin", "tan", "cin"]);

export function EditClientForm({ client, onDone }: { client: ClientDetail; onDone: () => void }) {
  const updateClient = useUpdateClient(client.id);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(client.name);
  const [entityType, setEntityType] = useState<string>(client.entityType);
  const [tags, setTags] = useState(client.tags.join(", "));
  const [fields, setFields] = useState<Record<OptionalField, string>>(
    () => Object.fromEntries(OPTIONAL_FIELDS.map((k) => [k, client[k] ?? ""])) as Record<OptionalField, string>,
  );

  function set(key: OptionalField, value: string) {
    setFields((f) => ({ ...f, [key]: UPPERCASE.has(key) ? value.toUpperCase() : value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateClient.mutateAsync({
        name: name.trim(),
        entityType,
        // A blanked-out field clears the stored value rather than being ignored.
        ...Object.fromEntries(OPTIONAL_FIELDS.map((k) => [k, fields[k].trim() || null])),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save client details.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="muted field-label">Client name</label>
      <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="muted field-label">Entity type</label>
      <select className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
        {ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 10px" }}>
        <Field label="PAN" value={fields.pan} onChange={(v) => set("pan", v)} />
        <Field label="GSTIN" value={fields.gstin} onChange={(v) => set("gstin", v)} />
        <Field label="TAN" value={fields.tan} onChange={(v) => set("tan", v)} />
        <Field label="CIN" value={fields.cin} onChange={(v) => set("cin", v)} />
        <Field label="Email" type="email" value={fields.email} onChange={(v) => set("email", v)} />
        <Field label="Phone" value={fields.phone} onChange={(v) => set("phone", v)} />
        <Field label="Contact person" value={fields.contactPerson} onChange={(v) => set("contactPerson", v)} />
        <Field label="Financial year" placeholder="2025-26" value={fields.financialYear} onChange={(v) => set("financialYear", v)} />
        <Field label="Assessment year" placeholder="2026-27" value={fields.assessmentYear} onChange={(v) => set("assessmentYear", v)} />
      </div>

      <label className="muted field-label">Tags (comma-separated)</label>
      <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
      <label className="muted field-label">Notes</label>
      <textarea className="input" rows={3} value={fields.notes} onChange={(e) => set("notes", e.target.value)} />

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onDone} disabled={updateClient.isPending}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={updateClient.isPending}>
          {updateClient.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="muted field-label">{label}</label>
      <input type={type} className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
