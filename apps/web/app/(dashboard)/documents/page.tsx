"use client";

import { useRef, useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import {
  useClients,
  useCreateDocumentCategory,
  useDeleteDocument,
  useDocumentCategories,
  useDocuments,
  useDownloadDocument,
  useUploadDocument,
} from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [clientId, setClientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const clients = useClients({});
  const categories = useDocumentCategories();
  const documents = useDocuments({ clientId: clientId || undefined, categoryId: categoryId || undefined });
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const download = useDownloadDocument();
  const createCategory = useCreateDocumentCategory();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadClientId, setUploadClientId] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onFileChosen(file: File) {
    setError(null);
    try {
      await upload.mutateAsync({
        file,
        clientId: uploadClientId || undefined,
        categoryId: uploadCategoryId || undefined,
        tags: uploadTags || undefined,
      });
      setUploadTags("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload this file.");
    }
  }

  async function onDownload(id: string) {
    const result = await download.mutateAsync(id);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-500">{documents.data?.meta?.total ?? 0} total</p>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select className="input" value={uploadClientId} onChange={(e) => setUploadClientId(e.target.value)}>
            <option value="">No client (firm-wide)</option>
            {(clients.data?.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" value={uploadCategoryId} onChange={(e) => setUploadCategoryId(e.target.value)}>
            <option value="">No category</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Tags (comma-separated)"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => e.target.files?.[0] && onFileChosen(e.target.files[0])}
            disabled={upload.isPending}
          />
          {upload.isPending && <span className="text-xs text-slate-400">Uploading…</span>}
        </div>
        <p className="text-xs text-slate-400">
          PDF, images, Word/Excel/PowerPoint, plain text, or CSV — up to 25MB. Every upload is scanned before it&apos;s stored.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <input
            className="input max-w-xs"
            placeholder="New category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <button
            className="btn-secondary text-xs"
            disabled={!newCategoryName || createCategory.isPending}
            onClick={() => createCategory.mutateAsync({ name: newCategoryName }).then(() => setNewCategoryName(""))}
          >
            Add category
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <select className="input max-w-xs" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>
          {(clients.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input max-w-[200px]" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">File</th>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Size</th>
              <th className="px-5 py-3">Uploaded</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {documents.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  No documents yet.
                </td>
              </tr>
            )}
            {documents.data?.data.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <button className="font-medium text-slate-900 hover:text-brand-600" onClick={() => onDownload(d.id)}>
                    {d.fileName}
                  </button>
                  {d.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <span key={t} className="badge bg-slate-100 text-slate-500">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-500">{d.client?.name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-500">{d.category?.name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-500">{formatSize(d.sizeBytes)}</td>
                <td className="px-5 py-3 text-slate-400">{formatDateTime(d.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    className="text-xs text-red-600 hover:text-red-700"
                    onClick={() => remove.mutateAsync(d.id).catch(() => undefined)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
