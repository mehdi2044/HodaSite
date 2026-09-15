import { db } from "@/lib/db";
import { getMarkets, getSiteSettings } from "@/modules/settings";
import { pageBlocksSchema } from "@/modules/content";
import {
  localized,
  normalizeSeo,
  SEO_LOCALES,
  seoPath,
  xmlEscape,
  type SeoKind,
} from "@/lib/seo";
const SIZE = 1000;
const kinds = ["home", "p", "c", "pages"] as const;
const document = (tag: string, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</${tag}>`;
const productWhere = (marketId: string) => ({
  deletedAt: null,
  status: "ACTIVE" as const,
  marketIds: { has: marketId },
});
const pageWhere = (marketId: string) => ({
  deletedAt: null,
  status: "published",
  OR: [{ marketIds: { isEmpty: true } }, { marketIds: { has: marketId } }],
});
export async function getSitemapIndex() {
  const [site, markets] = await Promise.all([getSiteSettings(), getMarkets()]);
  const config = normalizeSeo(site?.seo);
  if (!config.indexingEnabled) return document("sitemapindex", "");
  const sections = await Promise.all(
    markets
      .filter(
        (m) =>
          m.isActive && SEO_LOCALES.some((l) => m.enabledLocales.includes(l)),
      )
      .map(async (m) => {
        const counts = await Promise.all([
          Promise.resolve(1),
          db.product.count({ where: productWhere(m.id) }),
          db.category.count({ where: { deletedAt: null } }),
          db.page.count({ where: pageWhere(m.id) }),
        ]);
        return kinds
          .flatMap((kind, i) =>
            Array.from(
              { length: Math.ceil(counts[i] / SIZE) },
              (_, page) =>
                `<sitemap><loc>${xmlEscape(`${config.origin}/sitemaps/${encodeURIComponent(m.code)}/${kind}/${page}.xml`)}</loc></sitemap>`,
            ),
          )
          .join("");
      }),
  );
  return document("sitemapindex", sections.join(""));
}
export async function getSitemapPage(code: string, kind: string, part: string) {
  if (!kinds.includes(kind as SeoKind) || !/^(0|[1-9]\d{0,5})\.xml$/.test(part))
    return null;
  const page = Number(part.slice(0, -4));
  const [site, markets] = await Promise.all([getSiteSettings(), getMarkets()]);
  const config = normalizeSeo(site?.seo);
  const market = markets.find((m) => m.code === code && m.isActive);
  if (!market) return null;
  if (!config.indexingEnabled) return document("urlset", "");
  const pagination = {
    orderBy: { id: "asc" as const },
    skip: page * SIZE,
    take: SIZE,
  };
  const select = { slugI18n: true, updatedAt: true };
  const rows =
    kind === "home"
      ? page === 0
        ? [{ slugI18n: {}, updatedAt: site!.updatedAt }]
        : []
      : kind === "p"
        ? await db.product.findMany({
            where: productWhere(market.id),
            select,
            ...pagination,
          })
        : kind === "c"
          ? await db.category.findMany({
              where: { deletedAt: null },
              select,
              ...pagination,
            })
          : (
              await db.page.findMany({
                where: pageWhere(market.id),
                select: { ...select, blocks: true },
                ...pagination,
              })
            ).filter((row) => pageBlocksSchema.safeParse(row.blocks).success);
  const urls = rows.flatMap((row) =>
    SEO_LOCALES.filter(
      (locale) =>
        market.enabledLocales.includes(locale) &&
        (kind === "home" || localized(row.slugI18n, locale)),
    ).map((locale) => {
      const url =
        config.origin +
        seoPath(
          locale,
          market.code,
          kind as SeoKind,
          localized(row.slugI18n, locale),
        );
      return `<url><loc>${xmlEscape(url)}</loc><lastmod>${row.updatedAt.toISOString()}</lastmod></url>`;
    }),
  );
  return document("urlset", urls.join(""));
}
