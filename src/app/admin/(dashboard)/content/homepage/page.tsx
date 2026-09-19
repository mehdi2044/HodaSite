import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import {
  localizedValue,
  homepageBlocksSchema,
} from "@/modules/content/homepage";
import { HomepageBuilder } from "@/components/admin/homepage-builder";
import { saveHomepage } from "./actions";

export default async function HomepageAdmin() {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await can(session.user.id, "content.homepage.read"))
  )
    redirect("/admin");
  const t = await getTranslations("homepageAdmin");
  const locale = (await getLocale()) as "fa" | "tr" | "en";
  const [rows, markets, categories, collections] = await Promise.all([
    db.homepage.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    db.market.findMany({ orderBy: { code: "asc" } }),
    db.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        titleI18n: true,
        parentId: true,
        media: { select: { url: true, status: true, deletedAt: true } },
      },
    }),
    db.collection.findMany({
      where: { deletedAt: null },
      orderBy: { slug: "asc" },
      select: { id: true, titleI18n: true },
    }),
  ]);
  const compositions = Object.fromEntries(
    rows.map((row) => {
      const parsed = homepageBlocksSchema.safeParse(row.blocks);
      return [row.marketId ?? "global", parsed.success ? parsed.data : []];
    }),
  );
  const ids = [
    ...new Set(
      rows.flatMap((row) => {
        const parsed = homepageBlocksSchema.safeParse(row.blocks);
        return parsed.success
          ? parsed.data.flatMap((block) =>
              (block.type === "Hero" || block.type === "Banner") &&
              block.mediaId
                ? [block.mediaId]
                : [],
            )
          : [];
      }),
    ),
  ];
  const media = ids.length
    ? await db.media.findMany({
        where: { id: { in: ids }, kind: "image", deletedAt: null },
        select: { id: true, storageKey: true },
      })
    : [];
  return (
    <HomepageBuilder
      action={saveHomepage}
      categories={categories.map((item) => ({
        id: item.id,
        root: item.parentId === null,
        mediaUrl:
          item.media?.status === "READY" && !item.media.deletedAt
            ? item.media.url
            : undefined,
        title: localizedValue(
          item.titleI18n as Record<typeof locale, string>,
          locale,
        ),
      }))}
      collections={collections.map((item) => ({
        id: item.id,
        title: localizedValue(
          item.titleI18n as Record<typeof locale, string>,
          locale,
        ),
      }))}
      compositions={compositions}
      mediaUrls={Object.fromEntries(
        media.map((item) => [item.id, `/media/${item.storageKey}`]),
      )}
      markets={markets.map((market) => ({ id: market.id, code: market.code }))}
      labels={{
        heroLayout: t("heroLayout"),
        editorialLayout: t("editorialLayout"),
        spatialLayout: t("spatialLayout"),
        title: t("title"),
        description: t("description"),
        global: t("global"),
        market: t("market"),
        add: t("add"),
        save: t("save"),
        preview: t("preview"),
        mobile: t("mobile"),
        desktop: t("desktop"),
        moveUp: t("moveUp"),
        moveDown: t("moveDown"),
        remove: t("remove"),
        empty: t("empty"),
        latest: t("latest"),
        bestseller: t("bestseller"),
        category: t("category"),
        collection: t("collection"),
        limit: t("limit"),
        chooseSource: t("chooseSource"),
        missingSource: t("missingSource"),
        rootCategories: t("rootCategories"),
        catalogPreview: t("catalogPreview"),
        scopeHelp: t("scopeHelp"),
        heroHelp: t("heroHelp"),
        trustItem: t("trustItem"),
        addTrustItem: t("addTrustItem"),
        selectImage: t("selectImage"),
        fieldTitle: t("fieldTitle"),
        body: t("body"),
        ctaLabel: t("ctaLabel"),
        ctaUrl: t("ctaUrl"),
        source: t("source"),
      }}
    />
  );
}
