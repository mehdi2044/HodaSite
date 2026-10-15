import { db } from "@/lib/db";
import { seoPath } from "@/lib/seo-urls";
import { fittingConfig } from "@/modules/fitting";
import { pageBlocksSchema } from "./validation";
import { contentTargetSchema } from "./moda4-contracts";
import type { z } from "zod";
export type ContentTarget = z.infer<typeof contentTargetSchema>;
/** Slug readers require the selected language; a display-text fallback is not a route. */
function translatedSlug(value: unknown, locale: "fa" | "tr" | "en") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const slug = (value as Record<string, unknown>)[locale];
  return typeof slug === "string" && slug.trim() ? slug : null;
}
/** Actual public routes only. Private/draft pages and absent translations cannot become CTAs. */
export async function resolveContentTarget(
  raw: ContentTarget,
  marketId: string,
  locale: "fa" | "tr" | "en",
) {
  const target = contentTargetSchema.parse(raw);
  const market = await db.market.findFirst({
    where: { id: marketId, isActive: true, enabledLocales: { has: locale } },
    select: { code: true },
  });
  if (!market) return null;
  if (target.kind === "catalog" || target.kind === "search")
    return `/${locale}/search?${new URLSearchParams({ market: market.code })}`;
  if (target.kind === "fitting")
    return ((c) => c.enabled || c.instantEnabled)(await fittingConfig())
      ? `/${locale}/fitting-room?${new URLSearchParams({ market: market.code })}`
      : null;
  if (!target.id) return null;
  if (target.kind === "category") {
    const row = await db.category.findFirst({
      where: { id: target.id, deletedAt: null },
      select: { slugI18n: true },
    });
    const slug = row && translatedSlug(row.slugI18n, locale);
    return slug ? seoPath(locale, market.code, "c", slug) : null;
  }
  if (target.kind === "product") {
    const row = await db.product.findFirst({
      where: {
        id: target.id,
        status: "ACTIVE",
        deletedAt: null,
        coinPackCoins: null,
        marketIds: { has: marketId },
        category: { deletedAt: null },
        variants: {
          some: {
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
        },
      },
      select: { slugI18n: true },
    });
    const slug = row && translatedSlug(row.slugI18n, locale);
    return slug ? seoPath(locale, market.code, "p", slug) : null;
  }
  if (target.kind === "collection") {
    const row = await db.collection.findFirst({
      where: { id: target.id, deletedAt: null },
      select: { id: true },
    });
    return row
      ? `/${locale}/search?${new URLSearchParams({ market: market.code, collectionId: row.id })}`
      : null;
  }
  const row = await db.page.findFirst({
    where: {
      id: target.id,
      deletedAt: null,
      status: "published",
      OR: [{ marketIds: { has: marketId } }, { marketIds: { isEmpty: true } }],
    },
    select: { slugI18n: true, blocks: true },
  });
  if (row && !pageBlocksSchema.safeParse(row.blocks).success) return null;
  const slug = row && translatedSlug(row.slugI18n, locale);
  return slug ? seoPath(locale, market.code, "pages", slug) : null;
}
