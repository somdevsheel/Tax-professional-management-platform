"use client";

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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-slate-200 px-5">
        <span className="text-sm font-semibold tracking-tight text-slate-900">Tax Practice Platform</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
  );
}
