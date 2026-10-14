import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import {
  localizedValue,
  homepageBlocksSchema,
} from "@/modules/content/homepage";
import { blockMediaIds } from "@/modules/media/reference-lock";
import { ModaHomepageBuilder } from "@/components/admin/moda-homepage-builder";
import { adminHomepageOptions } from "@/modules/content/admin-homepage-options";
import { REVISION_FORMAT } from "@/modules/content/publication";
import { saveHomepage } from "./actions";

export default async function HomepageAdmin({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; revision?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const userId = session.user.id,
    query = await searchParams;
  const globalRead = await can(userId, "content.homepage.read");
  const allMarkets = await db.market.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  const rights = await Promise.all(
    allMarkets.map((market) =>
      can(userId, "content.homepage.read", { marketId: market.id }),
    ),
  );
  const allowedMarkets = allMarkets.filter((_, index) => rights[index]);
  if (!globalRead && !allowedMarkets.length) redirect("/admin");
  const selected =
    query.scope ?? (globalRead ? "global" : allowedMarkets[0].id);
  if (
    (selected === "global" && !globalRead) ||
    (selected !== "global" &&
      !allowedMarkets.some((market) => market.id === selected))
  )
    notFound();
  const t = await getTranslations("homepageAdmin");
  const scenes = await getTranslations("scenes");
  const locale = (await getLocale()) as "fa" | "tr" | "en";
  const [rows, markets, categories, collections, products] = await Promise.all([
    db.homepage.findMany({
      where: {
        deletedAt: null,
        ...(globalRead
          ? {}
          : { marketId: { in: allowedMarkets.map((market) => market.id) } }),
      },
      orderBy: { createdAt: "asc" },
    }),
    Promise.resolve(allowedMarkets),
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
    db.product.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        coinPackCoins: null,
        category: { deletedAt: null },
        ...(globalRead
          ? {}
          : {
              marketIds: { hasSome: allowedMarkets.map((market) => market.id) },
            }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        titleI18n: true,
        variants: {
          where: {
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
          select: { color: { select: { id: true, nameI18n: true } } },
        },
      },
    }),
  ]);
  const compositions = Object.fromEntries(
    rows.map((row) => {
      const parsed = homepageBlocksSchema.safeParse(
        row.draftBlocks ?? row.blocks,
      );
      return [row.marketId ?? "global", parsed.success ? parsed.data : []];
    }),
  );
  const global = await db.homepage.findFirst({
    where: { marketId: null, isPublished: true, deletedAt: null },
    select: { blocks: true },
  });
  const fallback = homepageBlocksSchema.safeParse(global?.blocks ?? []);
  let historical = false;
  if (query.revision) {
    const home = rows.find((row) => (row.marketId ?? "global") === selected);
    if (!home || !/^[A-Za-z0-9_-]{1,100}$/.test(query.revision)) notFound();
    const revision = await db.auditLog.findFirst({
      where: {
        id: query.revision,
        entityType: "Homepage",
        entityId: home.id,
        action: "content.homepage.revision",
      },
    });
    const snapshot = revision?.after as {
      format?: string;
      blocks?: unknown;
    } | null;
    if (snapshot?.format !== REVISION_FORMAT) notFound();
    const blocks = homepageBlocksSchema.safeParse(snapshot.blocks);
    if (!blocks.success) notFound();
    compositions[selected] = blocks.data;
    historical = true;
  }
  const options = await adminHomepageOptions(
    locale,
    allowedMarkets.map((market) => market.id),
    globalRead,
  );
  const writable = Object.fromEntries(
    await Promise.all(
      [
        ...(globalRead ? ["global"] : []),
        ...allowedMarkets.map((market) => market.id),
      ].map(async (scope) => [
        scope,
        await can(
          userId,
          "content.homepage.write",
          scope === "global" ? undefined : { marketId: scope },
        ),
      ]),
    ),
  );
  const ids = [
    ...new Set(
      rows.flatMap((row) => {
        const parsed = homepageBlocksSchema.safeParse(
          row.draftBlocks ?? row.blocks,
        );
        return parsed.success ? blockMediaIds(parsed.data) : [];
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
    <>
      <a
        className="button mb-5 inline-flex"
        href="/admin/content/homepage/scenes"
      >
        {scenes("editorTitle")}
      </a>
      <ModaHomepageBuilder
        options={options}
        writable={writable}
        globalAllowed={globalRead}
        initialScope={selected}
        historical={historical}
        fallbackBlocks={fallback.success ? fallback.data : []}
        action={saveHomepage}
        versions={Object.fromEntries(
          rows.map((row) => [row.marketId ?? "global", row.version]),
        )}
        categories={categories.map((item) => ({
          id: item.id,
          root: item.parentId === null,
          titleI18n: item.titleI18n as Record<"fa" | "tr" | "en", string>,
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
        products={products.map((product) => ({
          id: product.id,
          title: localizedValue(
            product.titleI18n as Record<typeof locale, string>,
            locale,
          ),
          colors: [
            ...new Map(
              product.variants.map((variant) => [
                variant.color.id,
                {
                  id: variant.color.id,
                  title: localizedValue(
                    variant.color.nameI18n as Record<typeof locale, string>,
                    locale,
                  ),
                },
              ]),
            ).values(),
          ],
        }))}
        compositions={compositions}
        mediaUrls={Object.fromEntries(
          media.map((item) => [item.id, `/media/${item.storageKey}`]),
        )}
        markets={markets.map((market) => ({
          id: market.id,
          code: market.code,
          enabledLocales: market.enabledLocales,
        }))}
        labels={{
          shopLook: t("shopLook"),
          lookName: t("lookName"),
          addLook: t("addLook"),
          lookProducts: t("lookProducts"),
          lookColor: t("lookColor"),
          lookDepartment: t("lookDepartment"),
          lookHelp: t("lookHelp"),
          heroLayout: t("heroLayout"),
          editorialLayout: t("editorialLayout"),
          spatialLayout: t("spatialLayout"),
          title: t("title"),
          description: t("description"),
          global: t("global"),
          market: t("market"),
          add: t("add"),
          save: t("save"),
          publish: scenes("publishChanges"),
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
    </>
  );
}
