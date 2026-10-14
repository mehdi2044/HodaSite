"use client";
import { useContext, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";
import { MediaPickerPendingContext } from "./media-picker-pending";
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
  kind = "image",
}: {
  kind?: "image" | "video";
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
  const registrationId = useId();
  const reportPending = useContext(MediaPickerPendingContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const searchSequence = useRef(0);
  useEffect(
    () => () => {
      uploadController.current?.abort();
      searchController.current?.abort();
      reportPending(registrationId, false);
    },
    [reportPending, registrationId],
  );
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || !uploading) return;
    // Also protect custom admin forms without a pending-context provider,
    // including implicit Enter and programmatic requestSubmit().
    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    form.addEventListener("submit", block, true);
    return () => form.removeEventListener("submit", block, true);
  }, [uploading]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function search(query: string) {
    const sequence = ++searchSequence.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setLoading(true);
    setItems([]);
    try {
      const res = await fetch(
        `/api/admin/media?kind=${kind}&q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error("MEDIA_SEARCH_FAILED");
      const json = (await res.json()) as { items?: PickerItem[] };
      if (!controller.signal.aborted && sequence === searchSequence.current)
        setItems(json.items ?? []);
    } catch {
      if (!controller.signal.aborted && sequence === searchSequence.current)
        setItems([]);
    } finally {
      if (!controller.signal.aborted && sequence === searchSequence.current)
        setLoading(false);
    }
  }

  function open() {
    dialogRef.current?.showModal();
    void search(q);
  }

  function select(item: PickerItem) {
    if (item.status !== "READY" || (item.kind && item.kind !== kind)) return;
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
    searchController.current?.abort();
    searchSequence.current++;
    setLoading(false);
    uploadController.current?.abort();
    uploadController.current = null;
    setUploading(false);
    reportPending(registrationId, false);
    dialogRef.current?.close();
  }

  async function uploadNew(files: FileList | null) {
    const file = files?.[0];
    if (!file || uploading) return;
    const controller = new AbortController();
    uploadController.current?.abort();
    uploadController.current = controller;
    setUploading(true);
    reportPending(registrationId, true);
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
      const ready = await waitForReadyMedia(json.id, controller.signal, kind);
      controller.signal.throwIfAborted();
      select(ready);
    } catch {
      if (!controller.signal.aborted) setUploadError(true);
    } finally {
      if (uploadController.current === controller) {
        uploadController.current = null;
        setUploading(false);
        reportPending(registrationId, false);
      }
    }
  }

  return (
    <div className="grid gap-1">
      <span>{label}</span>
      <input ref={inputRef} type="hidden" name={name} value={mediaId} />
      <div className="flex flex-wrap items-center gap-2">
        {preview &&
          (kind === "video" ? (
            <video
              src={preview}
              controls
              preload="metadata"
              className="max-h-24 max-w-48"
            />
          ) : (
            <img
              src={preview}
              alt=""
              className="max-h-16 max-w-40 rounded-[6px] border border-black/10 object-contain"
            />
          ))}
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
        aria-label={t("chooseMedia")}
        className="m-auto w-[min(48rem,92vw)] rounded-token bg-surface p-6 text-text backdrop:bg-black/40"
        onCancel={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              void search(e.target.value);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="min-h-11 min-w-0 flex-1 rounded-[8px] border border-black/10 px-3 text-sm"
          />
          <label className="inline-flex min-h-11 items-center cursor-pointer text-sm text-primary underline">
            {t("uploadNew")}
            <input
              type="file"
              hidden
              accept={
                kind === "image"
                  ? "image/png,image/jpeg,image/webp,image/avif"
                  : "video/mp4,video/webm"
              }
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
              {kind === "video" ? (
                <>
                  <video
                    src={item.url}
                    muted
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-surface text-xs">
                    {item.originalName ?? t("chooseMedia")}
                  </span>
                </>
              ) : (
                <img
                  src={
                    item.status === "READY"
                      ? (item.variants?.webp?.["320"]?.url ?? item.url)
                      : (item.blurDataUrl ?? item.url)
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
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
