import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { HomepageBlock } from "./homepage";
import { isModa4Block } from "./moda4-contracts";
import type { ContentTarget } from "./moda4-targets";
import { promotionRevisionSchema } from "@/modules/promotions/contracts";
export function moda4ReferenceProducts(blocks: HomepageBlock[]) {
  const ids: string[] = [];
  walk(blocks, (row) => {
    if (row.kind === "product" && typeof row.id === "string") ids.push(row.id);
    if (row.mode === "manual" && Array.isArray(row.productIds))
      ids.push(
        ...row.productIds.filter((id): id is string => typeof id === "string"),
      );
  });
  return [...new Set(ids)].sort();
}
function walk(value: unknown, visit: (row: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  visit(row);
  Object.values(row).forEach((item) => walk(item, visit));
}
export async function validateModa4References(
  tx: Prisma.TransactionClient,
  blocks: HomepageBlock[],
  scopeMarketId: string | null,
  marketIds: string[],
  publish: boolean,
) {
  const targets: ContentTarget[] = [],
    categories: string[] = [],
    collections: string[] = [],
    pages: string[] = [],
    programs: string[] = [];
  const moda = blocks.filter(isModa4Block);
  walk(moda, (row) => {
    if (
      typeof row.kind === "string" &&
      [
        "category",
        "collection",
        "product",
        "page",
        "catalog",
        "search",
        "fitting",
      ].includes(row.kind)
    )
      targets.push(row as ContentTarget);
  });
  for (const target of targets) {
    if (target.kind === "category" && target.id) categories.push(target.id);
    if (target.kind === "collection" && target.id) collections.push(target.id);
    if (target.kind === "page" && target.id) pages.push(target.id);
  }
  for (const block of moda) {
    if (block.type === "WorldsPrism")
      categories.push(...block.faces.map((face) => face.categoryId));
    if (block.type === "NewIn" || block.type === "KidsWorld") {
      if (block.source.mode === "category" && block.source.referenceId)
        categories.push(block.source.referenceId);
      if (block.source.mode === "collection" && block.source.referenceId)
        collections.push(block.source.referenceId);
    }
    if (block.type === "Campaign") {
      if (publish && !scopeMarketId) throw new z.ZodError([]);
      programs.push(block.programId);
    }
    if (block.type === "VideoBanner" && block.scene?.mode === "COMPOSITE")
      throw new z.ZodError([]);
    if (block.type === "FittingAd")
      for (const look of block.looks) {
        if (!look.finalPhoto) continue;
        const identity = (items: typeof look.scene.pieces) =>
          items
            .map((item) => `${item.productId}:${item.colorId}`)
            .sort()
            .join("|");
        if (
          look.finalPhoto.mode !== "PHOTO" ||
          identity(look.scene.pieces) !== identity(look.finalPhoto.pieces)
        )
          throw new z.ZodError([]);
      }
  }
  for (const [table, values] of [
    ["Category", categories],
    ["Collection", collections],
    ["Page", pages],
    ["PromotionProgram", programs],
  ] as const) {
    const ids = [...new Set(values)].sort();
    if (ids.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM ${Prisma.raw('"' + table + '"')} WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`,
      );
  }
  for (const [table, values] of [
    ["category", categories],
    ["collection", collections],
  ] as const) {
    const ids = [...new Set(values)];
    const where = { id: { in: ids }, deletedAt: null };
    if (
      ids.length &&
      (table === "category"
        ? await tx.category.count({ where })
        : await tx.collection.count({ where })) !== ids.length
    )
      throw new z.ZodError([]);
  }
  for (const pageId of [...new Set(pages)]) {
    const row = await tx.page.findFirst({
      where: { id: pageId, status: "published", deletedAt: null },
    });
    if (
      !row ||
      (row.marketIds.length &&
        marketIds.some((id) => !row.marketIds.includes(id)))
    )
      throw new z.ZodError([]);
  }
  for (const programId of [...new Set(programs)]) {
    const row = await tx.promotionProgram.findUnique({
      where: { id: programId },
      include: {
        revisions: { orderBy: { version: "desc" }, take: 1 },
        market: true,
      },
    });
    const revision = promotionRevisionSchema.safeParse(
      row?.revisions[0]?.config,
    );
    if (
      !row ||
      !revision.success ||
      !row.market.isActive ||
      (scopeMarketId && row.marketId !== scopeMarketId) ||
      row.currency !== row.market.currency ||
      revision.data.id !== row.id ||
      revision.data.revision !== row.version ||
      revision.data.marketId !== row.marketId ||
      revision.data.currency !== row.currency ||
      revision.data.status === "ARCHIVED" ||
      (publish &&
        (!revision.data.enabled ||
          !["ACTIVE", "SCHEDULED"].includes(revision.data.status)))
    )
      throw new z.ZodError([]);
  }
  const products = moda4ReferenceProducts(moda);
  if (
    products.length &&
    (await tx.product.count({
      where: {
        id: { in: products },
        status: "ACTIVE",
        deletedAt: null,
        coinPackCoins: null,
        marketIds: { hasEvery: marketIds },
        category: { deletedAt: null },
        variants: {
          some: {
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
        },
      },
    })) !== products.length
  )
    throw new z.ZodError([]);
  if (publish && targets.length) {
    const markets = await tx.market.findMany({
      where: { id: { in: marketIds } },
      select: { enabledLocales: true },
    });
    const locales = [
      ...new Set(markets.flatMap((market) => market.enabledLocales)),
    ];
    for (const target of targets) {
      if (!target.id || !["category", "product", "page"].includes(target.kind))
        continue;
      const row =
        target.kind === "category"
          ? await tx.category.findUnique({
              where: { id: target.id },
              select: { slugI18n: true },
            })
          : target.kind === "product"
            ? await tx.product.findUnique({
                where: { id: target.id },
                select: { slugI18n: true },
              })
            : await tx.page.findUnique({
                where: { id: target.id },
                select: { slugI18n: true },
              });
      const slugs = row?.slugI18n as Record<string, unknown> | undefined;
      if (
        !slugs ||
        locales.some(
          (locale) =>
            typeof slugs[locale] !== "string" || !String(slugs[locale]).trim(),
        )
      )
        throw new z.ZodError([]);
    }
  }
}
