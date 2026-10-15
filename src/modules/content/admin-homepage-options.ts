import { db } from "@/lib/db";
import { catalogText } from "@/modules/catalog";
import { storeCutoutModels } from "@/modules/catalog/cutouts/models";
import type { ModaAdminOptions } from "@/components/admin/moda4-block-fields";
import { promotionRevisionSchema } from "@/modules/promotions/contracts";
/** Caller authorizes the read scopes first; return only reference choices, never private promo rules. */
export async function adminHomepageOptions(
  locale: "fa" | "tr" | "en",
  marketIds: string[],
  globalRead: boolean,
): Promise<ModaAdminOptions> {
  const [products, categories, collections, pages, models, programs] =
    await Promise.all([
      db.product.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,
          coinPackCoins: null,
          category: { deletedAt: null },
          ...(globalRead ? {} : { marketIds: { hasSome: marketIds } }),
        },
        select: {
          id: true,
          titleI18n: true,
          marketIds: true,
          media: {
            where: {
              media: { kind: "image", status: "READY", deletedAt: null },
            },
            select: {
              media: { select: { id: true, url: true, originalName: true } },
            },
          },
          cutouts: {
            where: {
              deletedAt: null,
              media: { kind: "image", status: "READY", deletedAt: null },
            },
            select: {
              colorId: true,
              variantId: true,
              media: { select: { id: true, url: true, originalName: true } },
            },
          },
          variants: {
            where: {
              isActive: true,
              size: { deletedAt: null },
              color: { deletedAt: null },
            },
            select: {
              id: true,
              size: { select: { value: true } },
              color: { select: { id: true, nameI18n: true } },
              media: {
                where: {
                  media: { kind: "image", status: "READY", deletedAt: null },
                },
                select: {
                  media: {
                    select: { id: true, url: true, originalName: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
      db.category.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      db.collection.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: { slug: "asc" },
      }),
      db.page.findMany({
        where: {
          status: "published",
          deletedAt: null,
          ...(globalRead
            ? {}
            : {
                OR: [
                  { marketIds: { isEmpty: true } },
                  { marketIds: { hasSome: marketIds } },
                ],
              }),
        },
        select: { id: true, titleI18n: true },
        orderBy: { createdAt: "asc" },
      }),
      storeCutoutModels(),
      db.promotionProgram.findMany({
        where: globalRead ? {} : { marketId: { in: marketIds } },
        select: {
          id: true,
          marketId: true,
          version: true,
          revisions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { titleI18n: true, config: true },
          },
        },
        orderBy: { id: "asc" },
      }),
    ]);
  const text = (value: unknown) => catalogText(value, locale);
  return {
    categories: categories.map((row) => ({
      id: row.id,
      title: text(row.titleI18n),
    })),
    collections: collections.map((row) => ({
      id: row.id,
      title: text(row.titleI18n),
    })),
    pages: pages.map((row) => ({ id: row.id, title: text(row.titleI18n) })),
    models: models.map((model) => ({
      id: model.id,
      title: text(model.label),
      kind: model.kind,
      mediaId: model.mediaId,
      url: model.image.url,
    })),
    programs: programs.flatMap((row) => {
      const revision = row.revisions[0],
        parsed = promotionRevisionSchema.safeParse(revision?.config);
      return revision &&
        parsed.success &&
        parsed.data.revision === row.version &&
        parsed.data.status !== "ARCHIVED"
        ? [
            {
              id: row.id,
              marketId: row.marketId,
              title: text(revision.titleI18n),
              state: parsed.data.status,
            },
          ]
        : [];
    }),
    products: products.flatMap((product) => {
      const colors = [
        ...new Map(
          product.variants.map((variant) => [variant.color.id, variant.color]),
        ).values(),
      ];
      if (!colors.length) return [];
      return [
        {
          id: product.id,
          title: text(product.titleI18n),
          marketIds: globalRead
            ? product.marketIds
            : product.marketIds.filter((id) => marketIds.includes(id)),
          colors: colors.map((color) => {
            const variants = product.variants.filter(
                (variant) => variant.color.id === color.id,
              ),
              linked = [
                ...new Map(
                  variants.flatMap((variant) =>
                    variant.media.map(
                      (link) => [link.media.id, link.media] as const,
                    ),
                  ),
                ).values(),
              ];
            return {
              id: color.id,
              title: text(color.nameI18n),
              variants: variants.map((variant) => ({
                id: variant.id,
                size: variant.size.value,
              })),
              images: (linked.length
                ? linked
                : colors.length === 1
                  ? product.media.map((link) => link.media)
                  : []
              ).map((media) => ({
                id: media.id,
                url: media.url,
                title: media.originalName,
              })),
              cutouts: product.cutouts
                .filter((profile) => profile.colorId === color.id)
                .map((profile) => ({
                  id: profile.media.id,
                  url: profile.media.url,
                  title: profile.media.originalName,
                  variantId: profile.variantId,
                })),
            };
          }),
        },
      ];
    }),
  };
}
