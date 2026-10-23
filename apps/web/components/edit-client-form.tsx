"use client";

import { useState, type FormEvent } from "react";
import { ApiError, type ClientDetail } from "@tax-platform/api-client";
import { ENTITY_TYPES } from "@tax-platform/types";
import { useUpdateClient } from "@/lib/hooks";

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

const GRID_FIELDS: Array<{ key: Exclude<OptionalField, "notes">; label: string; type?: string; placeholder?: string }> = [
  { key: "pan", label: "PAN" },
  { key: "gstin", label: "GSTIN" },
  { key: "tan", label: "TAN" },
  { key: "cin", label: "CIN" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "contactPerson", label: "Contact person" },
  { key: "financialYear", label: "Financial year", placeholder: "2025-26" },
  { key: "assessmentYear", label: "Assessment year", placeholder: "2026-27" },
];

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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="edit-name">Client name</label>
          <input id="edit-name" required className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="edit-entity">Entity type</label>
          <select id="edit-entity" className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GRID_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`edit-${f.key}`}>{f.label}</label>
            <input
              id={`edit-${f.key}`}
              type={f.type ?? "text"}
              className="input"
              placeholder={f.placeholder}
              value={fields[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="edit-tags">Tags (comma-separated)</label>
        <input id="edit-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="edit-notes">Notes</label>
        <textarea id="edit-notes" rows={3} className="input" value={fields.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={onDone} disabled={updateClient.isPending}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={updateClient.isPending}>
          {updateClient.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
