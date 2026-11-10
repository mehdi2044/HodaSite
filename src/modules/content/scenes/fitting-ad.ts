import { catalogText, type CatalogLocale } from "@/modules/catalog";
import {
  cutoutClip,
  instantPlacement,
} from "@/modules/catalog/cutouts/fitting-rig";
import { projectCutout } from "@/modules/catalog/cutouts/geometry";
import { storeCutoutModels } from "@/modules/catalog/cutouts/models";
import type { ResponsiveImageMedia } from "@/components/storefront/responsive-image";
import type { Moda4Block } from "../moda4-contracts";
import {
  compositeSceneReferences,
  fingerprintCompositeSnapshot,
} from "./composite";
import { sceneReferenceSnapshot } from "./references";
import type { ShoppableScene } from "./contracts";

type Look = Extract<Moda4Block, { type: "FittingAd" }>["looks"][number];
export type FittingSlot = Awaited<
  ReturnType<typeof compositeSceneReferences>
>["pieces"][number]["display"]["slot"];
export type FittingAdPiece = {
  id: string;
  rackKey: string;
  slot: FittingSlot;
  media: ResponsiveImageMedia;
  target: NonNullable<ReturnType<typeof projectCutout>>;
  clip?: string;
  rackOrder: number;
};
export type FittingAdLook = {
  id: string;
  label: string;
  model: ResponsiveImageMedia;
  photo: FittingAdPhoto | null;
  pieces: FittingAdPiece[];
};
type FittingAdPhoto = {
  desktop: ResponsiveImageMedia;
  mobile: ResponsiveImageMedia;
};
type Diagnostic = {
  id: string;
  label: string;
  reason:
    | "MATCH_REQUIRED"
    | "INVALID_REFERENCE"
    | "TOO_FEW_PIECES"
    | "MISSING_CUTOUT"
    | "MISSING_MODEL"
    | "PHOTO_MISMATCH";
};
const frame = {
  aspect: "3:4",
  fit: "contain",
  focal: { x: 0.5, y: 0.5 },
} as const;
const order: Record<FittingSlot, number> = {
  BOTTOM: 0,
  SHOES: 1,
  ONE_PIECE: 2,
  TOP: 3,
  LAYER: 4,
  ACCESSORY: 5,
};

export function matchingFittingPhoto(
  scene: ShoppableScene,
  photo: ShoppableScene,
) {
  const identity = (value: ShoppableScene) =>
    value.pieces
      .map((p) =>
        JSON.stringify([p.productId, p.colorId, p.preferredVariantId ?? null]),
      )
      .sort()
      .join("\n");
  return photo.mode === "PHOTO" && identity(scene) === identity(photo);
}

function media(image: ResponsiveImageMedia): ResponsiveImageMedia {
  const { url, variants, width, height, blurDataUrl, altI18n } = image;
  return { url, variants, width, height, blurDataUrl, altI18n };
}

export async function resolveFittingAdLooks(
  looks: Look[],
  marketId: string,
  locale: CatalogLocale,
) {
  const models = await storeCutoutModels();
  const resolved = await Promise.all(
    looks.map(async (look) => {
      const label = catalogText(look.label, locale);
      const diagnostics: Diagnostic[] = [];
      const fail = (reason: Diagnostic["reason"]) => {
        diagnostics.push({ id: look.id, label, reason });
        return null;
      };
      const photoScene =
        look.finalPhoto ?? (look.scene.mode === "PHOTO" ? look.scene : null);
      let photo: FittingAdPhoto | null = null;
      if (photoScene) {
        if (!matchingFittingPhoto(look.scene, photoScene))
          fail("PHOTO_MISMATCH");
        else {
          const snapshot = await sceneReferenceSnapshot(photoScene, [
            marketId,
          ]).catch(() => null);
          const desktop = snapshot?.images.find(
            (item) => item.id === photoScene.desktop.mediaId,
          );
          const mobile = snapshot?.images.find(
            (item) => item.id === photoScene.mobile.mediaId,
          );
          if (
            desktop &&
            mobile &&
            snapshot?.fingerprint === photoScene.match?.fingerprint
          )
            photo = { desktop: media(desktop), mobile: media(mobile) };
          else fail(snapshot ? "MATCH_REQUIRED" : "INVALID_REFERENCE");
        }
      }

      const assemble = async (): Promise<FittingAdLook | null> => {
        if (look.scene.mode !== "COMPOSITE") return null;
        if (look.scene.pieces.length < 2) return fail("TOO_FEW_PIECES");
        if (!models.some((model) => model.id === look.scene.modelId))
          return fail("MISSING_MODEL");
        if (!look.scene.match?.fingerprint) return fail("MATCH_REQUIRED");
        const snapshot = await compositeSceneReferences(
          look.scene,
          marketId,
        ).catch(() => null);
        if (!snapshot) return fail("INVALID_REFERENCE");
        if (
          fingerprintCompositeSnapshot(snapshot) !==
          look.scene.match.fingerprint
        )
          return fail("MATCH_REQUIRED");
        const { image } = snapshot.model;
        if (!image.width || !image.height) return fail("MISSING_MODEL");
        const pieces: FittingAdPiece[] = [];
        for (const p of snapshot.pieces) {
          const reference = look.scene.pieces.find((item) => item.id === p.id);
          const placement = instantPlacement(
            p.display.geometry,
            {
              version: p.display.profileVersion,
              slot: p.display.slot,
              anchor: p.display.anchor,
            },
            {
              id: snapshot.model.id,
              mediaId: image.id,
              width: image.width,
              height: image.height,
            },
          );
          const target = projectCutout(
            placement,
            { width: image.width, height: image.height },
            frame,
          );
          if (
            !reference ||
            !target?.visible ||
            !p.display.media.width ||
            !p.display.media.height
          )
            return fail("MISSING_CUTOUT");
          pieces.push({
            id: p.id,
            rackKey: JSON.stringify([
              reference.productId,
              reference.colorId,
              p.display.mediaId,
            ]),
            slot: p.display.slot,
            media: media(p.display.media),
            target,
            clip: cutoutClip(placement),
            rackOrder: look.scene.pieces.indexOf(reference),
          });
        }
        pieces.sort(
          (a, b) => order[a.slot] - order[b.slot] || a.rackOrder - b.rackOrder,
        );
        return { id: look.id, label, photo, model: media(image), pieces };
      };
      return { animated: await assemble(), photo, diagnostics };
    }),
  );
  return {
    animated: resolved.flatMap(({ animated }) => (animated ? [animated] : [])),
    staticPhoto: resolved.find(({ photo }) => photo)?.photo ?? null,
    diagnostics: resolved.flatMap(({ diagnostics }) => diagnostics),
  };
}
