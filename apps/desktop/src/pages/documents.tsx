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
} from "../lib/hooks";
import { formatDateTime } from "../lib/format";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
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
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Documents</h2>
          <p className="muted" style={{ margin: "2px 0 0" }}>{documents.data?.meta?.total ?? 0} total</p>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => e.target.files?.[0] && onFileChosen(e.target.files[0])}
            disabled={upload.isPending}
          />
          {upload.isPending && <span className="muted">Uploading…</span>}
        </div>
        <p className="muted">
          PDF, images, Word/Excel/PowerPoint, plain text, or CSV — up to 25MB. Every upload is scanned before it&apos;s stored.
        </p>
        {error && <p className="error-text">{error}</p>}

        <div style={{ display: "flex", gap: 8, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <input
            className="input"
            style={{ maxWidth: 260, marginBottom: 0 }}
            placeholder="New category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            disabled={!newCategoryName || createCategory.isPending}
            onClick={() => createCategory.mutateAsync({ name: newCategoryName }).then(() => setNewCategoryName(""))}
          >
            Add category
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 240, marginBottom: 0 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">All clients</option>
          {(clients.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" style={{ maxWidth: 200, marginBottom: 0 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Client</th>
              <th>Category</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documents.isLoading && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Loading…
                </td>
              </tr>
            )}
            {documents.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  No documents yet.
                </td>
              </tr>
            )}
            {documents.data?.data.map((d) => (
              <tr key={d.id}>
                <td>
                  <button
                    onClick={() => onDownload(d.id)}
                    style={{ background: "none", border: "none", padding: 0, color: "#0f172a", fontWeight: 500, cursor: "pointer" }}
                  >
                    {d.fileName}
                  </button>
                </td>
                <td className="muted">{d.client?.name ?? "—"}</td>
                <td className="muted">{d.category?.name ?? "—"}</td>
                <td className="muted">{formatSize(d.sizeBytes)}</td>
                <td className="muted">{formatDateTime(d.createdAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn btn-secondary"
                    style={{ color: "#dc2626" }}
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
