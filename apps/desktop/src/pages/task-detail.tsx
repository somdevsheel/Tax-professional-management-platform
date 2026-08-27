import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TASK_PRIORITIES, TASK_STATUSES } from "@tax-platform/types";
import {
  useAddTaskComment,
  useAssignTask,
  useDeleteTask,
  useOrganizationMembers,
  useTask,
  useTaskComments,
  useUpdateTask,
} from "../lib/hooks";
import { formatDateTime } from "../lib/format";

export function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id!;
  const navigate = useNavigate();
  const task = useTask(taskId);
  const comments = useTaskComments(taskId);
  const members = useOrganizationMembers();
  const update = useUpdateTask(taskId);
  const assign = useAssignTask();
  const remove = useDeleteTask();
  const addComment = useAddTaskComment(taskId);

  const [commentBody, setCommentBody] = useState("");

  if (task.isLoading) return <p className="muted">Loading…</p>;
  if (!task.data) return <p className="error-text">Task not found.</p>;

  const t = task.data;

  async function onDelete() {
    await remove.mutateAsync(t.id);
    navigate("/tasks");
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: 18 }}>{t.title}</h2>
        <button className="btn btn-secondary" style={{ color: "#dc2626" }} onClick={onDelete}>
          Delete task
        </button>
      </div>

      <div className="card">
        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Title</label>
        <input
          className="input"
          defaultValue={t.title}
          onBlur={(e) => e.target.value !== t.title && update.mutate({ title: e.target.value })}
        />

        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Description</label>
        <textarea
          className="input"
          rows={3}
          defaultValue={t.description ?? ""}
          onBlur={(e) => e.target.value !== (t.description ?? "") && update.mutate({ description: e.target.value })}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Status</label>
            <select className="input" value={t.status} onChange={(e) => update.mutate({ status: e.target.value })}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Priority</label>
            <select className="input" value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: "block", marginBottom: 4 }}>Due date</label>
            <input
              type="date"
              className="input"
              defaultValue={t.dueDate ? t.dueDate.slice(0, 10) : ""}
              onChange={(e) => update.mutate({ dueDate: e.target.value || undefined })}
            />
          </div>
        </div>

        <label className="muted" style={{ display: "block", marginBottom: 4 }}>Assigned to</label>
        <select
          className="input"
          value={t.assignedTo ?? ""}
          onChange={(e) => assign.mutate({ id: t.id, assignedTo: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {(members.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.user.fullName}
            </option>
          ))}
        </select>

        {t.client && <p className="muted">Client: {t.client.name}</p>}
        <p className="muted">Created {formatDateTime(t.createdAt)}</p>
      </div>

      <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.03em" }}>Comments</h3>
      <div className="card" style={{ padding: 0 }}>
        {(comments.data ?? []).length === 0 && <p className="muted" style={{ padding: 16 }}>No comments yet.</p>}
        {(comments.data ?? []).map((c) => (
          <div key={c.id} className="list-row" style={{ display: "block", padding: 12 }}>
            <p style={{ margin: 0 }}>{c.body}</p>
            <p className="muted" style={{ margin: "4px 0 0" }}>{formatDateTime(c.createdAt)}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          className="input"
          style={{ marginBottom: 0 }}
          placeholder="Add a comment…"
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
        />
        <button
          className="btn btn-primary"
          disabled={!commentBody || addComment.isPending}
          onClick={() => addComment.mutateAsync(commentBody).then(() => setCommentBody(""))}
        >
          Post
        </button>
      </div>
    </div>
  );
}
