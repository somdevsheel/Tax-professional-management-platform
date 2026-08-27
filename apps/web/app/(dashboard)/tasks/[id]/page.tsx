"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TASK_PRIORITIES, TASK_STATUSES } from "@tax-platform/types";
import {
  useAddTaskComment,
  useAssignTask,
  useDeleteTask,
  useOrganizationMembers,
  useTask,
  useTaskComments,
  useUpdateTask,
} from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const task = useTask(params.id);
  const comments = useTaskComments(params.id);
  const members = useOrganizationMembers();
  const update = useUpdateTask(params.id);
  const assign = useAssignTask();
  const remove = useDeleteTask();
  const addComment = useAddTaskComment(params.id);

  const [commentBody, setCommentBody] = useState("");

  if (task.isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!task.data) return <p className="text-sm text-red-600">Task not found.</p>;

  const t = task.data;

  async function onDelete() {
    await remove.mutateAsync(t.id);
    router.replace("/tasks");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
        <button className="text-sm text-red-600 hover:text-red-700" onClick={onDelete}>
          Delete task
        </button>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            defaultValue={t.title}
            onBlur={(e) => e.target.value !== t.title && update.mutate({ title: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={3}
            defaultValue={t.description ?? ""}
            onBlur={(e) => e.target.value !== (t.description ?? "") && update.mutate({ description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Status</label>
            <select className="input" value={t.status} onChange={(e) => update.mutate({ status: e.target.value })}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              className="input"
              defaultValue={t.dueDate ? t.dueDate.slice(0, 10) : ""}
              onChange={(e) => update.mutate({ dueDate: e.target.value || undefined })}
            />
          </div>
        </div>

        <div>
          <label className="label">Assigned to</label>
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
        </div>

        {t.client && <p className="text-sm text-slate-500">Client: {t.client.name}</p>}
        <p className="text-xs text-slate-400">Created {formatDateTime(t.createdAt)}</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Comments</h2>
        <div className="card divide-y divide-slate-100 p-0">
          {(comments.data ?? []).length === 0 && <p className="p-4 text-sm text-slate-400">No comments yet.</p>}
          {(comments.data ?? []).map((c) => (
            <div key={c.id} className="p-4 text-sm">
              <p className="text-slate-800">{c.body}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDateTime(c.createdAt)}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="input"
            placeholder="Add a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
          <button
            className="btn-primary text-xs"
            disabled={!commentBody || addComment.isPending}
            onClick={() => {
              addComment.mutateAsync(commentBody).then(() => setCommentBody(""));
            }}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
