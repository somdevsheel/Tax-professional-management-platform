"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  ClientsIcon,
  PortalsIcon,
  TasksIcon,
  ComplianceIcon,
  DocumentsIcon,
  EmployeesIcon,
  ReportsIcon,
  ActivityIcon,
  SettingsIcon,
  CloseIcon,
} from "./icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/clients", label: "Clients", icon: ClientsIcon },
  { href: "/portals", label: "Portals", icon: PortalsIcon },
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/compliance", label: "Compliance", icon: ComplianceIcon },
  { href: "/documents", label: "Documents", icon: DocumentsIcon },
  { href: "/employees", label: "Employees", icon: EmployeesIcon },
  { href: "/reports", label: "Reports", icon: ReportsIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

/** Static column at md+; below that, an off-canvas drawer opened from the topbar's menu button. */
export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();

  // Navigating via a drawer link should dismiss the drawer.
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" aria-hidden="true" onClick={onClose} />
      )}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <span className="text-sm font-semibold tracking-tight text-slate-900">Tax Practice Platform</span>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className={active ? "text-brand-600" : "text-slate-400"} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
