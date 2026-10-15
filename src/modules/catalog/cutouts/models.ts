import { cache } from "react";
import { createHash } from "node:crypto";
import type { Media, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { configSchema } from "@/modules/fitting/contracts";
export type CutoutClient = Prisma.TransactionClient;
export function imageFingerprint(
  image: Pick<
    Media,
    "id" | "storageKey" | "width" | "height" | "mime" | "variants"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: image.id,
        storageKey: image.storageKey,
        width: image.width,
        height: image.height,
        mime: image.mime,
        variants: image.variants,
      }),
    )
    .digest("hex");
}
export const cutoutMediaSelect = {
  id: true,
  url: true,
  width: true,
  height: true,
  variants: true,
  blurDataUrl: true,
  altI18n: true,
} as const;
/** Public approved store imagery does not enable or invoke the paid integration. */
async function readStoreCutoutModels(client: CutoutClient) {
  const row = await client.integration.findUnique({
    where: { key: "fitting-room" },
  });
  const config = configSchema.safeParse(row?.config ?? {});
  if (!config.success) return [];
  const choices = config.data.models.filter((m) => m.enabled);
  const media = await client.media.findMany({
    where: {
      id: { in: choices.map((m) => m.mediaId) },
      kind: "image",
      status: "READY",
      deletedAt: null,
    },
  });
  return choices.flatMap((model) => {
    const image = media.find((m) => m.id === model.mediaId);
    if (!image || !image.width || !image.height) return [];
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          id: model.id,
          kind: model.kind,
          media: imageFingerprint(image),
        }),
      )
      .digest("hex");
    return [{ ...model, image, fingerprint }];
  });
}

// React cache lasts only for the current server render; transaction reads stay live.
const requestModels = cache(() => readStoreCutoutModels(db));
export function storeCutoutModels(client: CutoutClient = db) {
  return client === db ? requestModels() : readStoreCutoutModels(client);
}
