import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@tax-platform/api-client";
import { TASK_PRIORITIES, TASK_STATUSES } from "@tax-platform/types";
import { useCompleteTask, useCreateTask, useDeleteTask, useOrganizationMembers, useTasks } from "../lib/hooks";
import { formatDateTime } from "../lib/format";

export function TasksPage() {
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
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Tasks</h2>
          <p className="muted" style={{ margin: "2px 0 0" }}>{tasks.data?.meta?.total ?? 0} total</p>
        </div>
        {!showCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            New task
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card">
          <input
            className="input"
            placeholder="Task title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
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
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!form.title || createTask.isPending} onClick={onCreate}>
              {createTask.isPending ? "Creating…" : "Create task"}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 180, marginBottom: 0 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select className="input" style={{ maxWidth: 160, marginBottom: 0 }} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Client</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.isLoading && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Loading…
                </td>
              </tr>
            )}
            {tasks.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  No tasks match your filters.
                </td>
              </tr>
            )}
            {tasks.data?.data.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/tasks/${t.id}`} style={{ fontWeight: 500, color: "#0f172a", textDecoration: "none" }}>
                    {t.title}
                  </Link>
                </td>
                <td className="muted">{t.client?.name ?? "—"}</td>
                <td>
                  <span className="badge">{t.priority}</span>
                </td>
                <td>
                  <span className="badge">{t.status.replace(/_/g, " ")}</span>
                </td>
                <td className="muted">{t.dueDate ? formatDateTime(t.dueDate) : "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {t.status !== "COMPLETED" && (
                      <button
                        className="btn btn-secondary"
                        disabled={completeTask.isPending}
                        onClick={() => completeTask.mutateAsync(t.id).catch(() => undefined)}
                      >
                        Complete
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ color: "#dc2626" }}
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
