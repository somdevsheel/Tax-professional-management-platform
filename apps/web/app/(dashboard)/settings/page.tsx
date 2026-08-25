"use client";

import { useCurrentOrganization } from "@/lib/hooks";

export default function SettingsPage() {
  const org = useCurrentOrganization();

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-900">Firm details</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-900">{org.data?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Slug</dt>
            <dd className="font-medium text-slate-900">{org.data?.slug ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Plan</dt>
            <dd className="font-medium text-slate-900">{org.data?.plan ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">{org.data?.status ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-slate-400">
        Editing firm details, notification preferences, and credential-reveal policy land in a later build phase.
      </p>
    </div>
  );
}
