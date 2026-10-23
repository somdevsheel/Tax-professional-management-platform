import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Notification } from "@tax-platform/api-client";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "../lib/hooks";
import { formatDateTime } from "../lib/format";

/** Sidebar entry showing the unread count; opens a panel of recent notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  const list = useNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const count = unread.data?.count ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
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
    if (n.relatedEntityType === "task" && n.relatedEntityId) navigate(`/tasks/${n.relatedEntityId}`);
    else if (n.relatedEntityType === "compliance_item") navigate("/compliance");
  }

  return (
    <div ref={panelRef} style={{ position: "relative", marginBottom: 8 }}>
      <button className={`sidebar-button${open ? " active" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Notifications</span>
        {count > 0 && <span className="count-badge">{count > 99 ? "99+" : count}</span>}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-header">
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {count > 0 && (
              <button className="link-button" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                Mark all read
              </button>
            )}
          </div>
          {list.isLoading && <p className="muted" style={{ padding: 14, margin: 0 }}>Loading…</p>}
          {list.data?.length === 0 && (
            <p className="muted" style={{ padding: 14, margin: 0 }}>
              You're all caught up. Deadline reminders and task assignments show up here.
            </p>
          )}
          {(list.data ?? []).map((n) => (
            <button key={n.id} className={`notification-row${n.readAt ? "" : " unread"}`} onClick={() => openNotification(n)}>
              <span className="notification-title">{n.title}</span>
              {n.body && <span className="muted notification-body">{n.body}</span>}
              <span className="muted notification-time">{formatDateTime(n.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
