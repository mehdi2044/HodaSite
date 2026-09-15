import { z } from "zod";
import { db } from "@/lib/db";
import { localized, seoPath } from "@/lib/seo";
const inputSchema = z.object({
  locale: z.enum(["fa", "tr", "en"]),
  market: z.string().max(40),
  kind: z.enum(["p", "c", "pages"]),
  slug: z.string().min(1).max(500),
});
export async function resolveSlugRedirect(raw: unknown) {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { locale, market: code, kind, slug } = parsed.data;
  const market = await db.market.findFirst({
    where: { code, isActive: true, enabledLocales: { has: locale } },
    select: { id: true, code: true },
  });
  if (!market) return null;
  const history = await db.slugRedirect.findUnique({
    where: { kind_locale_oldSlug: { kind, locale, oldSlug: slug } },
  });
  if (!history) return null;
  const slugWhere = { slugI18n: { path: [locale], equals: slug } };
  if (kind === "p") {
    const visibility = {
      status: "ACTIVE" as const,
      deletedAt: null,
      marketIds: { has: market.id },
    };
    if (
      await db.product.findFirst({
        where: { ...visibility, ...slugWhere },
        select: { id: true },
      })
    )
      return null;
    const p = await db.product.findFirst({
      where: { id: history.entityId, ...visibility },
      select: { slugI18n: true },
    });
    const current = localized(p?.slugI18n, locale);
    return current && current !== slug
      ? seoPath(locale, code, kind, current)
      : null;
  }
  if (kind === "c") {
    if (
      await db.category.findFirst({
        where: { deletedAt: null, ...slugWhere },
        select: { id: true },
      })
    )
      return null;
    const p = await db.category.findFirst({
      where: { id: history.entityId, deletedAt: null },
      select: { slugI18n: true },
    });
    const current = localized(p?.slugI18n, locale);
    return current && current !== slug
      ? seoPath(locale, code, kind, current)
      : null;
  }
  const visibility = {
    status: "published",
    deletedAt: null,
    OR: [{ marketIds: { isEmpty: true } }, { marketIds: { has: market.id } }],
  };
  if (
    await db.page.findFirst({
      where: { ...visibility, ...slugWhere },
      select: { id: true },
    })
  )
    return null;
  const p = await db.page.findFirst({
    where: { id: history.entityId, ...visibility },
    select: { slugI18n: true },
  });
  const current = localized(p?.slugI18n, locale);
  return current && current !== slug
    ? seoPath(locale, code, kind, current)
    : null;
}
