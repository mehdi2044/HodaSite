import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
/** Called only by the proven-empty bootstrap. The supplied woman vector is
 * copied from prototype #mBody; other body types have independent outlines.
 * Rasterized into the existing authorized Media/model/reference pipeline. */
export async function seedModa4Mannequin(
  db: PrismaClient,
  put: (key: string, bytes: Buffer) => Promise<string>,
  id: string,
) {
  const bytes = await sharp(
    await readFile(`prisma/demo-assets/moda4/mannequins/${id}.svg`),
  )
    .webp({ quality: 95 })
    .toBuffer();
  const key = `media/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${randomUUID()}.webp`;
  return db.media.create({
    data: {
      id: `seed-moda4-mannequin-${id}`,
      kind: "image",
      status: "READY",
      mime: "image/webp",
      storageKey: key,
      url: await put(key, bytes),
      width: 420,
      height: 560,
      bytes: bytes.length,
      variants: {},
      originalName: `demo-moda4-mannequin-${id}.webp`,
      tags: ["demo", "prototype-vector", "mannequin"],
      altI18n: { fa: id, tr: id, en: id },
    },
  });
}
