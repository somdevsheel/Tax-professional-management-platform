"use client";

import { useState } from "react";
import { useAuditLog } from "@/lib/hooks";
import { formatDateTime, humanizeAction } from "@/lib/format";

const RESOURCE_TYPES = ["client", "credential", "organization_member", "portal_session"];

export default function ActivityPage() {
  const [resourceType, setResourceType] = useState("");
  const activity = useAuditLog(resourceType ? { resourceType } : undefined);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Activity</h1>
        <select className="input max-w-[200px]" value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
          <option value="">All resource types</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Resource</th>
              <th className="px-5 py-3">Result</th>
              <th className="px-5 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(activity.data?.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                  No activity recorded yet.
                </td>
              </tr>
            )}
            {(activity.data?.data ?? []).map((entry) => (
              <tr key={entry.id}>
                <td className="px-5 py-3 font-medium text-slate-800">{humanizeAction(entry.action)}</td>
                <td className="px-5 py-3 text-slate-500">{entry.resourceType.replace(/_/g, " ")}</td>
                <td className="px-5 py-3">
                  <span
                    className={`badge ${
                      entry.result === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {entry.result}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-400">{formatDateTime(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
