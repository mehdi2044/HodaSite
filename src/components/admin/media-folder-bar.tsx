import Link from "next/link";
import { cn } from "@/lib/cn";
import { createFolderAction } from "@/app/admin/(dashboard)/media/actions";

export function FolderBar({
  folders,
  activeFolderId,
  canWrite,
}: {
  folders: { id: string; name: string }[];
  activeFolderId?: string | null;
  canWrite: boolean;
}) {
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
        همه پوشه‌ها
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
            placeholder="پوشه جدید…"
            required
            className="h-8 w-32 rounded-full border border-black/10 px-3 text-xs"
          />
          <button
            type="submit"
            className="h-8 rounded-full border border-black/10 px-3 text-xs"
          >
            افزودن
          </button>
        </form>
      )}
    </div>
  );
}
