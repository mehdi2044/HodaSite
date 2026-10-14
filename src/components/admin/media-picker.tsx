"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";
import { waitForReadyMedia, type PickerItem } from "./media-picker-readiness";

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
  onSelect,
  allowClear = false,
}: {
  name: string;
  label: string;
  defaultMediaId?: string | null;
  defaultUrl?: string | null;
  onSelect?: (mediaId: string, url: string) => void;
  allowClear?: boolean;
}) {
  const t = useTranslations("media");
  const [mediaId, setMediaId] = useState(defaultMediaId ?? "");
  const [preview, setPreview] = useState(defaultUrl ?? "");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), []);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function search(query: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/media?kind=image&q=${encodeURIComponent(query)}`,
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
    if (item.status !== "READY") return;
    setMediaId(item.id);
    setPreview(item.url);
    onSelect?.(item.id, item.url);
    dialogRef.current?.close();
  }

  function clear() {
    setMediaId("");
    setPreview("");
    onSelect?.("", "");
  }

  function close() {
    uploadController.current?.abort();
    uploadController.current = null;
    setUploading(false);
    dialogRef.current?.close();
  }

  async function uploadNew(files: FileList | null) {
    const file = files?.[0];
    if (!file || uploading) return;
    const controller = new AbortController();
    uploadController.current?.abort();
    uploadController.current = controller;
    setUploading(true);
    setUploadError(false);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("UPLOAD_FAILED");
      const json = (await res.json()) as { id: string };
      // Keep the previous hidden value and the dialog until readiness is proven.
      const ready = await waitForReadyMedia(json.id, controller.signal);
      controller.signal.throwIfAborted();
      select(ready);
    } catch {
      if (!controller.signal.aborted) setUploadError(true);
    } finally {
      if (uploadController.current === controller) {
        uploadController.current = null;
        setUploading(false);
      }
    }
  }

  return (
    <div className="grid gap-1">
      <span>{label}</span>
      <input type="hidden" name={name} value={mediaId} />
      <div className="flex flex-wrap items-center gap-2">
        {preview && (
          // Admin-only preview thumbnail, not the storefront — plain <img>
          // is fine (same precedent as media-upload-field.tsx).
          <img
            src={preview}
            alt=""
            className="max-h-16 max-w-40 rounded-[6px] border border-black/10 object-contain"
          />
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={open}
          disabled={uploading}
        >
          {t("chooseMedia")}
        </Button>
        {allowClear && mediaId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={uploading}
          >
            {t("clearSelection")}
          </Button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(48rem,92vw)] rounded-token bg-surface p-6 text-text backdrop:bg-black/40"
        onCancel={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
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
            placeholder={t("searchPlaceholder")}
            className="h-9 flex-1 rounded-[8px] border border-black/10 px-3 text-sm"
          />
          <label className="cursor-pointer text-sm text-primary underline">
            {t("uploadNew")}
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/avif"
              disabled={uploading}
              onChange={(e) => {
                void uploadNew(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            {t("close")}
          </Button>
        </div>

        {uploading && (
          <p role="status" className="mt-3 text-sm">
            {t("pickerProcessing")}
          </p>
        )}
        {uploadError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {t("pickerFailed")}
          </p>
        )}
        <div className="mt-4 grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
          {loading && <p className="text-sm text-muted">{t("loading")}</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted">{t("empty")}</p>
          )}
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              data-testid={`media-picker-item-${item.id}`}
              disabled={uploading || item.status !== "READY"}
              onClick={() => select(item)}
              className="relative aspect-square disabled:opacity-60 overflow-hidden rounded-[6px] border border-black/10 hover:border-primary"
            >
              <img
                src={
                  item.status === "READY"
                    ? (item.variants?.webp?.["320"]?.url ?? item.url)
                    : (item.blurDataUrl ?? item.url)
                }
                alt=""
                className="h-full w-full object-cover"
              />
              {item.status !== "READY" && (
                <span className="absolute inset-x-0 bottom-0 bg-surface text-xs">
                  {t(item.status === "FAILED" ? "failed" : "processing")}
                </span>
              )}
            </button>
          ))}
        </div>
      </dialog>
    </div>
  );
}
