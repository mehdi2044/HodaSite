import Link from "next/link";
import { cn } from "@/lib/cn";
import { createFolderAction } from "@/app/admin/(dashboard)/media/actions";
import { useTranslations } from "next-intl";

export function FolderBar({
  folders,
  activeFolderId,
  canWrite,
}: {
  folders: { id: string; name: string }[];
  activeFolderId?: string | null;
  canWrite: boolean;
}) {
  const t = useTranslations("media");
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Link
        href="/admin/media"
        className={cn(
          "rounded-full border px-3 py-1 text-sm",
          !activeFolderId
            ? "border-primary bg-primary/10 text-primary"
            : "border-black/10 text-text",
        )}
      >
        {t("allFolders")}
      </Link>
      {folders.map((f) => (
        <Link
          key={f.id}
          href={`/admin/media?folder=${f.id}`}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            activeFolderId === f.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-black/10 text-text",
          )}
        >
          {f.name}
        </Link>
      ))}
      {canWrite && (
        <form action={createFolderAction} className="flex items-center gap-1">
          <input
            type="text"
            name="name"
            placeholder={t("newFolderPlaceholder")}
            required
            className="h-8 w-32 rounded-full border border-black/10 px-3 text-xs"
          />
          <button
            type="submit"
            className="h-8 rounded-full border border-black/10 px-3 text-xs"
          >
            {t("add")}
          </button>
        </form>
      )}
    </div>
  );
}
