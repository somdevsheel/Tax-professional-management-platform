"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@tax-platform/api-client";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/lib/hooks";
import { formatRelative } from "@/lib/format";
import { BellIcon } from "./icons";

/** Topbar bell with the unread count; opens a panel of recent notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  const list = useNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const count = unread.data?.count ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openNotification(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    if (n.relatedEntityType === "task" && n.relatedEntityId) router.push(`/tasks/${n.relatedEntityId}`);
    else if (n.relatedEntityType === "compliance_item") router.push("/compliance");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
      >
        <BellIcon />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-14 z-40 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-[28rem] sm:w-[22rem]"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {count > 0 && (
              <button
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Mark all read
              </button>
            )}
          </div>
          {list.isLoading && <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>}
          {list.data?.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              You&apos;re all caught up. Deadline reminders and task assignments show up here.
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {(list.data ?? []).map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openNotification(n)}
                  className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${n.readAt ? "" : "bg-brand-50/60"}`}
                >
                  <span className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-xs text-slate-500">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
