import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

/** Add approved outlined PNGs; never replace existing merchant Media/Theme. */
export const MODA4_BRAND_MEDIA = {
  logo: "seed-moda4-brand-logo",
  icon: "seed-moda4-brand-icon",
};
export async function seedModa4BrandMedia(
  db: PrismaClient,
  put: (key: string, bytes: Buffer) => Promise<string>,
) {
  const ids = MODA4_BRAND_MEDIA;
  for (const kind of ["logo", "icon"] as const) {
    if (await db.media.findUnique({ where: { id: ids[kind] } })) continue;
    const bytes = await readFile(
      join(process.cwd(), "prisma/demo-assets/moda4", `${kind}.png`),
    );
    const metadata = await sharp(bytes).metadata();
    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.png`;
    await db.media.create({
      data: {
        id: ids[kind],
        kind: "image",
        storageKey: key,
        url: await put(key, bytes),
        originalName: `seed-moda4-${kind}.png`,
        mime: "image/png",
        bytes: bytes.length,
        width: metadata.width,
        height: metadata.height,
        status: "READY",
        altI18n: { fa: "نشان مودا۴", tr: "MODA4 logosu", en: "MODA4 wordmark" },
        tags: ["demo", "brand"],
      },
    });
  }
  return ids;
}
