import { db } from "@/lib/db";
import {
  catalogProductInclude,
  catalogText,
  type CatalogLocale,
} from "@/modules/catalog";
import { getVariantDisplayPrices } from "@/modules/pricing";
import { seoPath } from "@/lib/seo-urls";
import type { ShoppableScene } from "./contracts";
import { sceneConfirmationKey } from "./contracts";
import { sceneReferenceSnapshot } from "./references";
import { compositeSceneReferences, type ScenePlacement } from "./composite";
import type { CutoutPlacement } from "@/modules/catalog/cutouts/contracts";
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
export type SceneLayer = {
  media: ScenePlacement["media"];
  geometry: CutoutPlacement;
};
export type SceneView = {
  mode?: "PHOTO" | "COMPOSITE";
  confirmationFingerprint?: string;
  confirmationKey?: string;
  relatedVideo?: { url: string; mime: string };
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
    referenceImage?: SceneMedia | null;
    layer?: SceneLayer;
    variants: {
      id: string;
      size: string;
      amount: string | null;
      available: number;
      layer?: SceneLayer;
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
  let composite:
    Awaited<ReturnType<typeof compositeSceneReferences>> | undefined;
  let images = await db.media.findMany({
    where: {
      id: { in: [scene.desktop.mediaId, scene.mobile.mediaId] },
      kind: "image",
      status: "READY",
      deletedAt: null,
    },
  });
  let confirmation: string | undefined;
  let relatedVideo: { url: string; mime: string } | undefined;
  let reason: SceneView["reason"] = null;
  {
    try {
      if (scene.mode === "COMPOSITE")
        composite = await compositeSceneReferences(scene, market.id);
      const snapshot = await sceneReferenceSnapshot(scene, [market.id]);
      const fingerprint = snapshot.fingerprint;
      if (snapshot.video)
        relatedVideo = { url: snapshot.video.url, mime: snapshot.video.mime };
      if (scene.mode === "PHOTO") {
        images = snapshot.images;
        confirmation = fingerprint;
      }
      if (scene.match?.fingerprint !== fingerprint) reason = "MATCH_REQUIRED";
    } catch {
      reason = "INVALID_REFERENCE";
    }
  }
  const result: SceneView = {
    id: scene.id,
    mode: scene.mode,
    ...(relatedVideo ? { relatedVideo } : {}),
    ...(options.adminPreview && confirmation
      ? {
          confirmationFingerprint: confirmation,
          confirmationKey: sceneConfirmationKey(scene),
        }
      : {}),
    title: catalogText(scene.title, locale),
    alt: catalogText(scene.alt, locale),
    currency: market.currency,
    reason,
    desktop: {
      frame: scene.desktop,
      media: publicImage(
        composite?.model.image ??
          images.find((image) => image.id === scene.desktop.mediaId),
      ),
    },
    mobile: {
      frame: scene.mobile,
      media: publicImage(
        composite?.model.image ??
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
    const layers = composite?.pieces.find((p) => p.id === piece.id);
    const layer = (placement: ScenePlacement): SceneLayer => ({
      media: placement.media,
      geometry: placement.geometry,
    });
    const variants = product.variants
      .filter((v) => v.colorId === piece.colorId)
      .map((v) => {
        const placement = layers?.variants.find(
          (item) => item.variantId === v.id,
        )?.placement;
        return {
          id: v.id,
          size: v.size.value,
          amount:
            scene.mode === "COMPOSITE" && !placement
              ? null
              : (prices?.get(v.id)?.amount ?? null),
          ...(placement ? { layer: layer(placement) } : {}),
          available: Math.max(
            0,
            v.stockItems.reduce((n, s) => n + s.onHand - s.reserved, 0),
          ),
        };
      });
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
        ...(options.adminPreview && scene.mode === "PHOTO"
          ? {
              referenceImage: publicImage(
                images.find((image) => image.id === piece.referenceMediaId),
              ),
            }
          : {}),
        ...(layers ? { layer: layer(layers.display) } : {}),
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
