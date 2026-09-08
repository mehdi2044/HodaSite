import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { listMedia, getFolders, type MediaListFilters } from "@/modules/media";
import { getPurgeRetentionDays } from "@/modules/media/purge";
import { MediaUploader } from "@/components/admin/media-uploader";
import { MediaGrid } from "@/components/admin/media-grid";
import { FolderBar } from "@/components/admin/media-folder-bar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("media");
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login?next=%2Fadmin%2Fmedia");
  const canRead = await can(session.user.id, "media.upload");
  if (!canRead) redirect("/admin?error=forbidden");
  const [canWrite, canDelete] = await Promise.all([
    can(session.user.id, "media.write"),
    can(session.user.id, "media.delete"),
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
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex gap-2">
          <Link
            href={trash ? "/admin/media" : "/admin/media?view=trash"}
            className="text-sm text-muted underline"
          >
            {trash ? t("backToLibrary") : t("trash")}
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
          placeholder={t("searchPlaceholder")}
          defaultValue={filters.q}
          className="h-10 rounded-[8px] border border-black/10 px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="h-10 rounded-[8px] border border-black/10 px-2 text-sm"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="PROCESSING">{t("processing")}</option>
          <option value="READY">{t("ready")}</option>
          <option value="FAILED">{t("failed")}</option>
        </select>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="h-10 rounded-[8px] border border-black/10 px-2 text-sm"
        >
          <option value="date_desc">{t("newest")}</option>
          <option value="date_asc">{t("oldest")}</option>
          <option value="name_asc">{t("nameSort")}</option>
          <option value="size_desc">{t("sizeSort")}</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-[8px] bg-primary px-4 text-sm text-white"
        >
          {t("applyFilter")}
        </button>
      </form>

      <p className="mt-2 text-sm text-muted">{t("total", { count: total })}</p>

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
          variants: m.variants as
            import("@/modules/media/constants").MediaVariants | null,
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
