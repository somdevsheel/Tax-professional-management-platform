"use client";

import { useState } from "react";
import Link from "next/link";
import { useClients } from "@/lib/hooks";

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDED"];

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const clients = useClients({ search: search || undefined, status: status || undefined });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">{clients.data?.meta?.total ?? 0} total</p>
        </div>
        <Link href="/clients/new" className="btn-primary">
          New client
        </Link>
      </div>

      <div className="flex gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search name, PAN, GSTIN, TAN, CIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Entity type</th>
              <th className="px-5 py-3">PAN / GSTIN</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.isLoading && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {clients.data?.data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  No clients match your filters.
                </td>
              </tr>
            )}
            {clients.data?.data.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {c.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500">{c.entityType.replace(/_/g, " ")}</td>
                <td className="px-5 py-3 text-slate-500">{c.pan || c.gstin || "—"}</td>
                <td className="px-5 py-3">
                  <span className="badge bg-slate-100 text-slate-600">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
