import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { listMedia, getFolders, type MediaListFilters } from "@/modules/media";
import { getPurgeRetentionDays } from "@/modules/media/purge";
import { MediaUploader } from "@/components/admin/media-uploader";
import { MediaGrid } from "@/components/admin/media-grid";
import { FolderBar } from "@/components/admin/media-folder-bar";
import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MediaLibrary({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const [canWrite, canDelete] = await Promise.all([
    session?.user?.id ? can(session.user.id, "media.write") : false,
    session?.user?.id ? can(session.user.id, "media.delete") : false,
  ]);

  const trash = one(sp.view) === "trash";
  const filters: MediaListFilters = {
    q: one(sp.q),
    folderId: one(sp.folder),
    kind: one(sp.kind),
    status: one(sp.status) as MediaListFilters["status"],
    trash,
    sort: (one(sp.sort) as MediaListFilters["sort"]) ?? "date_desc",
  };

  const [{ items, total }, folders, purgeRetentionDays] = await Promise.all([
    listMedia(filters),
    getFolders(),
    trash ? getPurgeRetentionDays() : Promise.resolve(30),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">کتابخانه رسانه</h1>
        <div className="flex gap-2">
          <Link
            href={trash ? "/admin/media" : "/admin/media?view=trash"}
            className="text-sm text-muted underline"
          >
            {trash ? "بازگشت به کتابخانه" : "سطل زباله"}
          </Link>
        </div>
      </div>

      {!trash && canWrite && <MediaUploader />}

      <FolderBar
        folders={folders}
        activeFolderId={filters.folderId}
        canWrite={canWrite}
      />

      <form method="get" className="mt-4 flex flex-wrap gap-2">
        {trash && <input type="hidden" name="view" value="trash" />}
        <input
          type="search"
          name="q"
          placeholder="جستجو بر اساس نام یا برچسب…"
          defaultValue={filters.q}
          className="h-10 rounded-[8px] border border-black/10 px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="h-10 rounded-[8px] border border-black/10 px-2 text-sm"
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="PROCESSING">در حال پردازش</option>
          <option value="READY">آماده</option>
          <option value="FAILED">ناموفق</option>
        </select>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="h-10 rounded-[8px] border border-black/10 px-2 text-sm"
        >
          <option value="date_desc">جدیدترین</option>
          <option value="date_asc">قدیمی‌ترین</option>
          <option value="name_asc">نام (الفبا)</option>
          <option value="size_desc">حجم (بیشترین)</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-[8px] bg-primary px-4 text-sm text-white"
        >
          اعمال فیلتر
        </button>
      </form>

      <p className="mt-2 text-sm text-muted">{total} مورد</p>

      <MediaGrid
        items={items.map((m) => ({
          id: m.id,
          url: m.url,
          status: m.status,
          kind: m.kind,
          originalName: m.originalName,
          bytes: m.bytes,
          width: m.width,
          height: m.height,
          blurDataUrl: m.blurDataUrl,
          processingError: m.processingError,
          altI18n: m.altI18n as Record<string, string> | null,
          tags: m.tags,
          folderId: m.folderId,
          folderName: m.folder?.name ?? null,
          deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
          createdAt: m.createdAt.toISOString(),
        }))}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        trash={trash}
        canWrite={canWrite}
        canDelete={canDelete}
        purgeRetentionDays={purgeRetentionDays}
      />
    </>
  );
}
