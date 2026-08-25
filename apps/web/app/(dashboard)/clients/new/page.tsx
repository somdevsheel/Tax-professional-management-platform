"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@tax-platform/api-client";
import { ENTITY_TYPES } from "@tax-platform/types";
import { useCreateClient } from "@/lib/hooks";

export default function NewClientPage() {
  const router = useRouter();
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
      router.replace(`/clients/${client.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create client.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">New client</h1>

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <div>
          <label className="label">Client name</label>
          <input required className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div>
          <label className="label">Entity type</label>
          <select className="input" value={form.entityType} onChange={(e) => set("entityType", e.target.value)}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">PAN</label>
            <input className="input" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input" value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">TAN</label>
            <input className="input" value={form.tan} onChange={(e) => set("tan", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">CIN</label>
            <input className="input" value={form.cin} onChange={(e) => set("cin", e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={createClient.isPending}>
            {createClient.isPending ? "Creating…" : "Create client"}
          </button>
        </div>
      </form>
    </div>
  );
}
