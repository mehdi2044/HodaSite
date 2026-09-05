"use client";
import { useState } from "react";

/**
 * Single-file upload field for Site Settings / Theme media (Phase 01a §2):
 * uploads through the existing `/api/uploads` endpoint and stores the
 * resulting `Media.id` in a hidden input. 01b's media picker will swap this
 * component but keep the same hidden-input `name` API.
 */
export function MediaUploadField({
  name,
  label,
  defaultUrl,
  defaultMediaId,
}: {
  name: string;
  label: string;
  defaultUrl?: string | null;
  defaultMediaId?: string | null;
}) {
  const [mediaId, setMediaId] = useState(defaultMediaId ?? "");
  const [preview, setPreview] = useState(defaultUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload_failed");
      const json = (await res.json()) as { id: string; url: string };
      setMediaId(json.id);
      setPreview(json.url);
    } catch {
      setError("آپلود ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="grid gap-1">
      <span>{label}</span>
      <input type="hidden" name={name} value={mediaId} />
      {preview && (
        // Admin-only preview thumbnail, not the storefront — plain <img> is fine.
        <img
          src={preview}
          alt=""
          className="max-h-16 max-w-40 rounded-[6px] border border-black/10 object-contain"
        />
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={onChange}
        disabled={busy}
        className="text-sm"
      />
      {busy && <small className="text-muted">در حال آپلود…</small>}
      {error && <small style={{ color: "var(--error)" }}>{error}</small>}
    </label>
  );
}
