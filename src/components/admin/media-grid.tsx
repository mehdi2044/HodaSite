"use client";
import { useState } from "react";
import { Badge, Sheet, Button } from "@/components/ui";
import {
  updateMediaMeta,
  softDeleteMediaAction,
  restoreMediaAction,
  retryProcessingAction,
  bulkMoveAction,
  bulkTagAction,
  bulkDeleteAction,
} from "@/app/admin/(dashboard)/media/actions";

export type MediaItem = {
  id: string;
  url: string;
  status: "PROCESSING" | "READY" | "FAILED";
  kind: string;
  originalName: string;
  bytes: number;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
  processingError: string | null;
  altI18n: Record<string, string> | null;
  tags: string[];
  folderId: string | null;
  folderName: string | null;
  deletedAt: string | null;
  createdAt: string;
};

function thumbSrc(item: MediaItem): string {
  return item.status === "READY" ? item.url : (item.blurDataUrl ?? item.url);
}

function daysRemaining(deletedAt: string): number {
  const purgedAt = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.ceil((purgedAt - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

export function MediaGrid({
  items,
  folders,
  trash,
  canWrite,
  canDelete,
}: {
  items: MediaItem[];
  folders: { id: string; name: string }[];
  trash: boolean;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ids = Array.from(selected).join(",");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0)
    return <p className="mt-6 text-sm text-muted">موردی یافت نشد.</p>;

  return (
    <>
      {selected.size > 0 && canWrite && (
        <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-token border border-black/10 bg-surface p-3">
          <span className="text-sm">{selected.size} مورد انتخاب شده</span>
          <form action={bulkMoveAction} className="flex items-center gap-1">
            <input type="hidden" name="ids" value={ids} />
            <select
              name="folderId"
              defaultValue=""
              className="h-8 rounded-[6px] border border-black/10 px-2 text-xs"
            >
              <option value="">بدون پوشه</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">
              انتقال
            </Button>
          </form>
          <form action={bulkTagAction} className="flex items-center gap-1">
            <input type="hidden" name="ids" value={ids} />
            <input
              type="text"
              name="tag"
              placeholder="برچسب…"
              required
              className="h-8 w-24 rounded-[6px] border border-black/10 px-2 text-xs"
            />
            <Button type="submit" size="sm" variant="secondary">
              افزودن برچسب
            </Button>
          </form>
          {canDelete && (
            <form action={bulkDeleteAction}>
              <input type="hidden" name="ids" value={ids} />
              <Button type="submit" size="sm" variant="destructive">
                حذف گروهی
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <MediaTile
            key={item.id}
            item={item}
            folders={folders}
            trash={trash}
            canWrite={canWrite}
            canDelete={canDelete}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>
    </>
  );
}

function MediaTile({
  item,
  folders,
  trash,
  canWrite,
  canDelete,
  selected,
  onToggle,
}: {
  item: MediaItem;
  folders: { id: string; name: string }[];
  trash: boolean;
  canWrite: boolean;
  canDelete: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-token border border-black/10">
      {canWrite && !trash && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="absolute start-2 top-2 z-10 h-4 w-4"
          aria-label="انتخاب"
        />
      )}
      <Sheet
        title={item.originalName}
        trigger={
          <div className="aspect-square cursor-pointer bg-black/5">
            {item.kind === "image" ? (
              // Admin-only thumbnail, not the storefront — plain <img> is
              // fine (same precedent as media-upload-field.tsx).
              <img
                src={thumbSrc(item)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">
                PDF
              </div>
            )}
            <div className="absolute bottom-1 start-1">
              {item.status === "PROCESSING" && (
                <Badge tone="warning">در حال پردازش</Badge>
              )}
              {item.status === "FAILED" && <Badge tone="error">ناموفق</Badge>}
            </div>
          </div>
        }
      >
        <div className="grid gap-3">
          <p>
            {item.width && item.height ? `${item.width}×${item.height} — ` : ""}
            {(item.bytes / 1024).toFixed(0)} کیلوبایت
          </p>

          {item.status === "FAILED" && canWrite && (
            <div className="grid gap-1">
              <p className="text-error">{item.processingError}</p>
              <form action={retryProcessingAction}>
                <input type="hidden" name="mediaId" value={item.id} />
                <Button type="submit" size="sm" variant="secondary">
                  تلاش دوباره
                </Button>
              </form>
            </div>
          )}

          {trash ? (
            <>
              {item.deletedAt && (
                <p>
                  {daysRemaining(item.deletedAt)} روز تا حذف قطعی باقی مانده
                </p>
              )}
              {canDelete && (
                <form action={restoreMediaAction}>
                  <input type="hidden" name="mediaId" value={item.id} />
                  <Button type="submit" size="sm">
                    بازیابی
                  </Button>
                </form>
              )}
            </>
          ) : (
            canWrite && (
              <form action={updateMediaMeta} className="grid gap-2">
                <input type="hidden" name="mediaId" value={item.id} />
                <label className="grid gap-1 text-xs">
                  متن جایگزین (fa)
                  <input
                    name="altFa"
                    defaultValue={item.altI18n?.fa ?? ""}
                    className="h-8 rounded-[6px] border border-black/10 px-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  متن جایگزین (tr)
                  <input
                    name="altTr"
                    defaultValue={item.altI18n?.tr ?? ""}
                    className="h-8 rounded-[6px] border border-black/10 px-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  متن جایگزین (en)
                  <input
                    name="altEn"
                    defaultValue={item.altI18n?.en ?? ""}
                    className="h-8 rounded-[6px] border border-black/10 px-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  برچسب‌ها (با کاما جدا کنید)
                  <input
                    name="tags"
                    defaultValue={item.tags.join(", ")}
                    className="h-8 rounded-[6px] border border-black/10 px-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  پوشه
                  <select
                    name="folderId"
                    defaultValue={item.folderId ?? ""}
                    className="h-8 rounded-[6px] border border-black/10 px-2"
                  >
                    <option value="">بدون پوشه</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" size="sm">
                  ذخیره
                </Button>
              </form>
            )
          )}

          {!trash && canDelete && (
            <form action={softDeleteMediaAction}>
              <input type="hidden" name="mediaId" value={item.id} />
              <Button type="submit" size="sm" variant="destructive">
                حذف
              </Button>
            </form>
          )}
        </div>
      </Sheet>
    </div>
  );
}
