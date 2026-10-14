import { db } from "@/lib/db";
import {
  catalogProductInclude,
  catalogText,
  type CatalogLocale,
} from "@/modules/catalog";
import { getVariantDisplayPrices } from "@/modules/pricing";
import { seoPath } from "@/lib/seo-urls";
import type { ShoppableScene } from "./contracts";
import { sceneReferenceFingerprint } from "./references";
import type { Media } from "@prisma/client";
type SceneMedia = Pick<
  Media,
  | "url"
  | "variants"
  | "width"
  | "height"
  | "blurDataUrl"
  | "altI18n"
  | "originalName"
>;
function publicImage(image: Media | undefined): SceneMedia | null {
  if (!image) return null;
  return {
    url: image.url,
    variants: image.variants,
    width: image.width,
    height: image.height,
    blurDataUrl: image.blurDataUrl,
    altI18n: image.altI18n,
    originalName: image.originalName,
  };
}

type Market = Parameters<typeof getVariantDisplayPrices>[1];
import { scenePriceRange, type ScenePriceRange } from "./prices";
export { scenePriceRange, type ScenePriceRange } from "./prices";
export type SceneView = {
  id: string;
  title: string;
  alt: string;
  currency: string;
  reason: "COMPOSITE_PENDING" | "INVALID_REFERENCE" | "MATCH_REQUIRED" | null;
  desktop: {
    frame: ShoppableScene["desktop"];
    media: SceneMedia | null;
  };
  mobile: {
    frame: ShoppableScene["mobile"];
    media: SceneMedia | null;
  };
  pieces: {
    id: string;
    title: string;
    color: string;
    href: string;
    desktop: ShoppableScene["pieces"][number]["desktop"];
    mobile: ShoppableScene["pieces"][number]["mobile"];
    side: "start" | "end";
    preferredVariantId?: string;
    variants: {
      id: string;
      size: string;
      amount: string | null;
      available: number;
    }[];
    range: ScenePriceRange | null;
  }[];
};
/** No public draft, user IDs, approval stamps or fabricated default sizes. */
export async function resolveShoppableScene(
  scene: ShoppableScene,
  market: Market,
  locale: CatalogLocale,
  options: { adminPreview?: boolean } = {},
): Promise<SceneView> {
  const images = await db.media.findMany({
    where: {
      id: { in: [scene.desktop.mediaId, scene.mobile.mediaId] },
      kind: "image",
      status: "READY",
      deletedAt: null,
    },
  });
  let reason: SceneView["reason"] =
    scene.mode === "COMPOSITE" ? "COMPOSITE_PENDING" : null;
  if (!reason) {
    try {
      const fingerprint = await sceneReferenceFingerprint(scene, [market.id]);
      if (scene.match?.fingerprint !== fingerprint) reason = "MATCH_REQUIRED";
    } catch {
      reason = "INVALID_REFERENCE";
    }
  }
  const result: SceneView = {
    id: scene.id,
    title: catalogText(scene.title, locale),
    alt: catalogText(scene.alt, locale),
    currency: market.currency,
    reason,
    desktop: {
      frame: scene.desktop,
      media: publicImage(
        images.find((image) => image.id === scene.desktop.mediaId),
      ),
    },
    mobile: {
      frame: scene.mobile,
      media: publicImage(
        images.find((image) => image.id === scene.mobile.mediaId),
      ),
    },
    pieces: [],
  };
  if (reason && (!options.adminPreview || reason !== "MATCH_REQUIRED"))
    return result;
  const products = await db.product.findMany({
    where: {
      id: { in: scene.pieces.map((p) => p.productId) },
      status: "ACTIVE",
      deletedAt: null,
      coinPackCoins: null,
      marketIds: { has: market.id },
      category: { deletedAt: null },
    },
    include: catalogProductInclude,
  });
  const selected = products.map((product) => ({
    ...product,
    variants: product.variants.filter(
      (v) =>
        v.isActive &&
        !v.color.deletedAt &&
        !v.size.deletedAt &&
        scene.pieces.some(
          (p) => p.productId === product.id && p.colorId === v.colorId,
        ),
    ),
  }));
  const prices = await getVariantDisplayPrices(selected, market).catch(
    () => null,
  );
  result.pieces = scene.pieces.flatMap((piece) => {
    const product = selected.find((p) => p.id === piece.productId);
    if (!product) return [];
    const variants = product.variants
      .filter((v) => v.colorId === piece.colorId)
      .map((v) => ({
        id: v.id,
        size: v.size.value,
        amount: prices?.get(v.id)?.amount ?? null,
        available: Math.max(
          0,
          v.stockItems.reduce((n, s) => n + s.onHand - s.reserved, 0),
        ),
      }));
    return [
      {
        id: piece.id,
        title: piece.label
          ? catalogText(piece.label, locale) ||
            catalogText(product.titleI18n, locale)
          : catalogText(product.titleI18n, locale),
        color: catalogText(
          product.variants.find((v) => v.colorId === piece.colorId)!.color
            .nameI18n,
          locale,
        ),
        href:
          seoPath(
            locale,
            market.code,
            "p",
            catalogText(product.slugI18n, locale),
          ) + `?color=${encodeURIComponent(piece.colorId)}`,
        desktop: piece.desktop,
        mobile: piece.mobile,
        side: piece.side,
        preferredVariantId: piece.preferredVariantId,
        variants,
        range: scenePriceRange(
          variants.flatMap((v) =>
            v.available > 0 && v.amount !== null ? [v.amount] : [],
          ),
        ),
      },
    ];
  });
  if (result.pieces.length !== scene.pieces.length)
    return { ...result, pieces: [], reason: "INVALID_REFERENCE" };
  return result;
}
