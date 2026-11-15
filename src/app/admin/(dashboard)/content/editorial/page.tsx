import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/modules/access";
import { requireAdminPage } from "@/modules/auth/page";
import {
  editorialContent,
  type EditorialLocale,
} from "@/modules/editorial/contracts";

export default async function EditorialAdmin({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await requireAdminPage("content.page.read");
  const kind = (await searchParams).kind === "ARTICLE" ? "ARTICLE" : "LOOK";
  const t = await getTranslations("editorial");
  const locale = (await getLocale()) as EditorialLocale;
  const entries = await db.editorialEntry.findMany({
    where: { kind },
    orderBy: { updatedAt: "desc" },
    include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
  });
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/content/editorial">{t("gallery")}</Link>
        <Link href="/admin/content/editorial?kind=ARTICLE">
          {t("magazine")}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">
        {t(kind === "LOOK" ? "gallery" : "magazine")}
      </h1>
      {(await can(user, "content.page.write")) && (
        <Link
          className="button"
          href={`/admin/content/editorial/new?kind=${kind}`}
        >
          {t("new")}
        </Link>
      )}
      {entries.length === 0 && <p>{t("empty")}</p>}
      <ul className="grid gap-2">
        {entries.map((entry) => {
          const revision = entry.revisions[0];
          const content = editorialContent.safeParse(revision?.body);
          const status = entry.deletedAt
            ? "archived"
            : !revision?.visibleFrom
              ? "draft"
              : revision.visibleFrom > new Date()
                ? "scheduled"
                : "published";
          return (
            <li key={entry.id} className="rounded-token border p-3">
              <Link href={`/admin/content/editorial/${entry.id}`}>
                {content.success ? content.data.title[locale] : entry.slugEn}
              </Link>
              <span className="mx-3">{t(status)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
