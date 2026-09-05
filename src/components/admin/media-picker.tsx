"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type PickerItem = {
  id: string;
  url: string;
  status: "PROCESSING" | "READY" | "FAILED";
  blurDataUrl: string | null;
};

/**
 * Shared media picker (Phase 01b §4): a modal with the same
 * search/grid/upload as `/admin/media`, returning a `mediaId`. Same
 * hidden-input `name` API as the single-file `MediaUploadField` it replaces,
 * so it drops into an existing `<form>` unchanged — Settings → Brand today,
 * product images (Phase 02) and page/hero images (01c) later.
 */
export function MediaPicker({
  name,
  label,
  defaultMediaId,
  defaultUrl,
}: {
  name: string;
  label: string;
  defaultMediaId?: string | null;
  defaultUrl?: string | null;
}) {
  const [mediaId, setMediaId] = useState(defaultMediaId ?? "");
  const [preview, setPreview] = useState(defaultUrl ?? "");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function search(query: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/media?q=${encodeURIComponent(query)}`,
      );
      const json = (await res.json()) as { items?: PickerItem[] };
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  function open() {
    dialogRef.current?.showModal();
    void search(q);
  }

  function select(item: PickerItem) {
    setMediaId(item.id);
    setPreview(item.url);
    dialogRef.current?.close();
  }

  async function uploadNew(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) return;
    const json = (await res.json()) as { id: string; url: string };
    setMediaId(json.id);
    setPreview(json.url);
    dialogRef.current?.close();
  }

  return (
    <div className="grid gap-1">
      <span>{label}</span>
      <input type="hidden" name={name} value={mediaId} />
      <div className="flex items-center gap-2">
        {preview && (
          // Admin-only preview thumbnail, not the storefront — plain <img>
          // is fine (same precedent as media-upload-field.tsx).
          <img
            src={preview}
            alt=""
            className="max-h-16 max-w-40 rounded-[6px] border border-black/10 object-contain"
          />
        )}
        <Button type="button" variant="secondary" size="sm" onClick={open}>
          انتخاب رسانه
        </Button>
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(48rem,92vw)] rounded-token bg-surface p-6 text-text backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              void search(e.target.value);
            }}
            placeholder="جستجو بر اساس نام یا برچسب…"
            className="h-9 flex-1 rounded-[8px] border border-black/10 px-3 text-sm"
          />
          <label className="cursor-pointer text-sm text-primary underline">
            آپلود جدید
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={(e) => void uploadNew(e.target.files)}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dialogRef.current?.close()}
          >
            بستن
          </Button>
        </div>

        <div className="mt-4 grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
          {loading && <p className="text-sm text-muted">در حال بارگذاری…</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted">موردی یافت نشد.</p>
          )}
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => select(item)}
              className="aspect-square overflow-hidden rounded-[6px] border border-black/10 hover:border-primary"
            >
              <img
                src={
                  item.status === "READY"
                    ? item.url
                    : (item.blurDataUrl ?? item.url)
                }
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </dialog>
    </div>
  );
}
