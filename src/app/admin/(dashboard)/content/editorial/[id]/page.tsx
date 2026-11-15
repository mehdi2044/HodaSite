import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/modules/access";
import { requireAdminPage } from "@/modules/auth/page";
import { catalogText } from "@/modules/catalog";
import {
  editorialContent,
  editorialId,
  locales,
  type EditorialContent,
  type EditorialLocale,
} from "@/modules/editorial/contracts";
import { ActionSubmit } from "@/components/admin/action-submit";
import {
  EditorialEditor,
  EditorialPublication,
} from "@/components/admin/editorial-editor";
import { changeEditorial, writeEditorial } from "../actions";

export default async function EditEditorial({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; copy?: string; restore?: string }>;
}) {
  const user = await requireAdminPage("content.page.read");
  const { id } = await params;
  const query = await searchParams;
  const mode = id === "new" ? "new" : "edit";
  const canWrite = await can(user, "content.page.write");
  if (mode === "new" && !canWrite) notFound();
  const currentId = mode === "new" ? query.copy : id;
  if (currentId && !editorialId.safeParse(currentId).success) notFound();
  const entry =
    (currentId &&
      (await db.editorialEntry.findUnique({
        where: { id: currentId },
        include: { revisions: { orderBy: { number: "desc" } } },
      }))) ||
    undefined;
  if (currentId && !entry) notFound();
  const revision = query.restore
    ? entry?.revisions.find((r) => r.id === query.restore)
    : entry?.revisions[0];
  const blank = { fa: "", tr: "", en: "" };
  const empty = {
    title: blank,
    summary: blank,
    mediaId: "",
    marketIds: [],
    featured: false,
    tags: [],
    audience: "WOMEN" as const,
  };
  const initial: EditorialContent = revision
    ? editorialContent.parse(revision.body)
    : query.kind === "ARTICLE"
      ? {
          ...empty,
          kind: "ARTICLE",
          author: "",
          category: "TRENDS",
          blocks: [],
        }
      : {
          ...empty,
          kind: "LOOK",
          season: "SPRING",
          occasion: "EVERYDAY",
          style: "CASUAL",
          color: "NEUTRAL",
          items: [],
        };
  const locale = (await getLocale()) as EditorialLocale;
  const t = await getTranslations("editorial");
  const [images, catalog, looks, markets, canPublish] = await Promise.all([
    canWrite
      ? db.media.findMany({
          where: { kind: "image", status: "READY", deletedAt: null },
          select: { id: true, originalName: true },
          orderBy: { originalName: "asc" },
        })
      : [],
    canWrite
      ? db.product.findMany({
          where: { status: "ACTIVE", deletedAt: null, coinPackCoins: null },
          select: {
            id: true,
            titleI18n: true,
            variants: {
              where: {
                isActive: true,
                color: { deletedAt: null },
                size: { deletedAt: null },
              },
              select: { id: true, sku: true, colorId: true },
            },
          },
          orderBy: { id: "asc" },
        })
      : [],
    canWrite && initial.kind === "ARTICLE"
      ? db.editorialEntry.findMany({
          where: { kind: "LOOK", deletedAt: null },
          select: { id: true, slugEn: true },
        })
      : [],
    db.market.findMany({
      where: { isActive: true },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    }),
    can(user, "content.page.publish"),
  ]);
  const latest = entry?.revisions[0];
  return (
    <section className="max-w-3xl grid gap-5">
      <Link href={`/admin/content/editorial?kind=${initial.kind}`}>
        {t(initial.kind === "LOOK" ? "gallery" : "magazine")}
      </Link>
      <h1 className="text-2xl font-semibold">
        {initial.title[locale] || t("new")}
      </h1>
      {mode === "edit" && entry && (
        <>
          {canWrite && (
            <Link href={`/admin/content/editorial/new?copy=${entry.id}`}>
              {t("duplicate")}
            </Link>
          )}
          {latest && (
            <details>
              <summary>{t("history")}</summary>
              <ul className="grid gap-3">
                {entry.revisions.map((item) => (
                  <li key={item.id}>
                    <bdi>#{item.number}</bdi>{" "}
                    <time dateTime={item.createdAt.toISOString()}>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Europe/Istanbul",
                      }).format(item.createdAt)}
                    </time>
                    <div className="flex flex-wrap gap-2">
                      {locales.flatMap((language) =>
                        markets.flatMap((market) =>
                          ["mobile", "desktop"].map((view) => (
                            <Link
                              key={`${language}-${market.id}-${view}`}
                              href={`/admin/content/editorial/${entry.id}/preview?revision=${item.id}&market=${market.code}&locale=${language}&view=${view}`}
                            >
                              {language} · {market.code} · {t(view)}
                            </Link>
                          )),
                        ),
                      )}
                    </div>
                    {canWrite && item.id !== latest.id && (
                      <Link href={`?restore=${item.id}`}>
                        {t("restoreDraft")}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {canPublish && latest && !latest.approvedBy && (
            <EditorialPublication
              id={entry.id}
              version={entry.version}
              revisionId={latest.id}
              action={changeEditorial}
            />
          )}
          {canPublish && !entry.deletedAt && (
            <ActionSubmit
              action={changeEditorial}
              fields={{
                id: entry.id,
                version: String(entry.version),
                operation: "archive",
              }}
              label={t("archive")}
            />
          )}
        </>
      )}
      {canWrite && (
        <EditorialEditor
          key={revision?.id ?? "new"}
          initial={initial}
          identity={mode === "edit" ? entry : undefined}
          images={images.map((image) => ({
            id: image.id,
            label: image.originalName,
          }))}
          variants={catalog.flatMap((p) =>
            p.variants.map((v) => ({
              productId: p.id,
              variantId: v.id,
              colorId: v.colorId,
              label: `${catalogText(p.titleI18n, locale)} · ${v.sku}`,
            })),
          )}
          looks={looks.map((look) => ({ id: look.id, label: look.slugEn }))}
          products={catalog.map((p) => ({
            id: p.id,
            label: catalogText(p.titleI18n, locale),
          }))}
          markets={markets.map((market) => ({
            id: market.id,
            label: market.code,
          }))}
          action={writeEditorial}
        />
      )}
    </section>
  );
}
