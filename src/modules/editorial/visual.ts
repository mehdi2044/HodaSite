import { Prisma, type Media } from "@prisma/client";
import { db } from "@/lib/db";
import type { LookContent } from "./contracts";
import { currentCatalogCutout } from "@/modules/catalog/cutouts/resolve";

const ready = { kind: "image", status: "READY", deletedAt: null } as const;
const catalogSelection = Prisma.validator<Prisma.VariantSelect>()({
  id: true,
  sku: true,
  productId: true,
  colorId: true,
  media: {
    where: { media: ready },
    orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
    select: { media: true },
  },
  product: {
    select: {
      marketIds: true,
      variants: {
        where: {
          isActive: true,
          color: { deletedAt: null },
          size: { deletedAt: null },
        },
        distinct: ["colorId"],
        select: { colorId: true },
      },
      media: {
        where: { media: ready },
        orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
        select: { media: true },
      },
    },
  },
});

export type LookVisual = {
  mode: "PHOTO" | "COMPOSITE";
  desktop?: Media;
  mobile?: Media;
  pieces: { variantId: string; sku: string; image?: Media }[];
};

export async function resolveLookVisuals(
  looks: LookContent[],
  marketIds: string[],
  client: Prisma.TransactionClient = db,
) {
  if (!looks.length) return [];
  const [variants, photos] = await Promise.all([
    client.variant.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              looks.flatMap(({ items }) =>
                items.map(({ variantId }) => variantId),
              ),
            ),
          ],
        },
        isActive: true,
        color: { deletedAt: null },
        size: { deletedAt: null },
        product: {
          status: "ACTIVE",
          deletedAt: null,
          coinPackCoins: null,
          category: { deletedAt: null },
        },
      },
      select: catalogSelection,
    }),
    client.media.findMany({
      where: {
        ...ready,
        id: {
          in: [
            ...new Set(
              looks.flatMap(({ mediaId, mobileMediaId }) =>
                mobileMediaId ? [mediaId, mobileMediaId] : [mediaId],
              ),
            ),
          ],
        },
      },
    }),
  ]);
  const catalog = new Map(variants.map((variant) => [variant.id, variant]));
  const images = new Map(photos.map((image) => [image.id, image]));
  return Promise.all(
    looks.map(async (look): Promise<LookVisual | null> => {
      const { visual, items } = look;
      if (!visual || items.length < 2) return null;
      const selected = items.flatMap((item) => {
        const variant = catalog.get(item.variantId);
        return variant?.productId === item.productId &&
          marketIds.every((id) => variant.product.marketIds.includes(id))
          ? [variant]
          : [];
      });
      if (selected.length !== items.length) return null;
      const pieces = await Promise.all(
        selected.map(async (variant) => {
          const marketId = marketIds[0] ?? variant.product.marketIds[0];
          const direct =
            variant.media[0]?.media ??
            (variant.product.variants.length === 1
              ? variant.product.media[0]?.media
              : undefined);
          return {
            variantId: variant.id,
            sku: variant.sku,
            image:
              direct ??
              (marketId
                ? (await currentCatalogCutout(variant.id, marketId, client))
                    ?.row.media
                : undefined),
          };
        }),
      );
      if (visual.mode === "COMPOSITE") {
        return pieces.every((piece) => piece.image)
          ? { mode: visual.mode, pieces }
          : null;
      }
      const desktop = images.get(look.mediaId);
      const mobile = look.mobileMediaId
        ? images.get(look.mobileMediaId)
        : undefined;
      if (
        !desktop ||
        (look.mobileMediaId && !mobile) ||
        visual.mediaId !== look.mediaId ||
        visual.mobileMediaId !== look.mobileMediaId ||
        visual.pieces.length !== selected.length ||
        !selected.every((variant) =>
          visual.pieces.some(
            ({ variantId, colorId }) =>
              variantId === variant.id && colorId === variant.colorId,
          ),
        )
      )
        return null;
      return { mode: visual.mode, desktop, mobile, pieces };
    }),
  );
}
