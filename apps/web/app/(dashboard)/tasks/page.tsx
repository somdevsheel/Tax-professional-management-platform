"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@tax-platform/api-client";
import { TASK_PRIORITIES, TASK_STATUSES } from "@tax-platform/types";
import { useCompleteTask, useCreateTask, useDeleteTask, useOrganizationMembers, useTasks } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  WAITING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-500",
  MEDIUM: "bg-blue-50 text-blue-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-red-50 text-red-700",
};

export default function TasksPage() {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const members = useOrganizationMembers();
  const tasks = useTasks({ status: status || undefined, priority: priority || undefined });
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", priority: "MEDIUM", dueDate: "", assignedTo: "" });
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    try {
      await createTask.mutateAsync({
        title: form.title,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        assignedTo: form.assignedTo || undefined,
      });
      setForm({ title: "", priority: "MEDIUM", dueDate: "", assignedTo: "" });
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create task.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500">{tasks.data?.meta?.total ?? 0} total</p>
        </div>
        {!showCreate && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            New task
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card space-y-3 p-5">
          <input
            className="input"
            placeholder="Task title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              className="input"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            <select
              className="input"
              value={form.assignedTo}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {(members.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.fullName}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs"
              disabled={!form.title || createTask.isPending}
              onClick={onCreate}
            >
              {createTask.isPending ? "Creating…" : "Create task"}
            </button>
            <button className="btn-secondary text-xs" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select className="input max-w-[160px]" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Priority</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Due</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {tasks.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  No tasks match your filters.
                </td>
              </tr>
            )}
            {tasks.data?.data.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {t.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-500">{t.client?.name ?? "—"}</td>
                <td className="px-5 py-3">
                  <span className={`badge ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status.replace(/_/g, " ")}</span>
                </td>
                <td className="px-5 py-3 text-slate-500">{t.dueDate ? formatDateTime(t.dueDate) : "—"}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {t.status !== "COMPLETED" && (
                      <button
                        className="btn-secondary text-xs"
                        disabled={completeTask.isPending}
                        onClick={() => completeTask.mutateAsync(t.id).catch(() => undefined)}
                      >
                        Complete
                      </button>
                    )}
                    <button
                      className="text-xs text-red-600 hover:text-red-700"
                      onClick={() => deleteTask.mutateAsync(t.id).catch(() => undefined)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
