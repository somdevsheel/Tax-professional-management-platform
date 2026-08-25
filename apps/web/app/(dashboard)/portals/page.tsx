"use client";

import { usePortalCatalog } from "@/lib/hooks";
import { ExternalLinkIcon } from "@/components/icons";

export default function PortalsPage() {
  const catalog = usePortalCatalog();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Portals</h1>
        <p className="text-sm text-slate-500">
          The platform-wide catalog. Link a portal to a client from that client&apos;s page to store credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(catalog.data ?? []).map((portal) => (
          <div key={portal.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{portal.name}</h3>
                <p className="text-xs text-slate-400">{portal.category.replace(/_/g, " ")}</p>
              </div>
              <a href={portal.baseUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-brand-600">
                <ExternalLinkIcon width={16} height={16} />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
