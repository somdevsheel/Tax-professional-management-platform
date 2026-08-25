"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status, organizationId } = useAuth();
  const router = useRouter();

  // Client-side redirect only — a UX convenience, not the authorization boundary. Every
  // request the pages below make is still independently authorized by the backend
  // (docs/security-design.md §4).
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }
  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {!organizationId ? <SelectOrganizationPrompt /> : children}
        </main>
      </div>
    </div>
  );
}

function SelectOrganizationPrompt() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-8 text-center">
      <p className="text-sm text-slate-600">
        You belong to more than one firm. Select one from the switcher at the top to continue.
      </p>
    </div>
  );
}
