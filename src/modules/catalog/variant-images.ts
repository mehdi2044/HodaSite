import type { Media } from "@prisma/client";
import { db } from "@/lib/db";

/** Resolve each exact variant first, then its product fallback, using only public ready images. */
export async function variantImages(
  variants: readonly { id: string; productId: string }[],
): Promise<Map<string, Media | undefined>> {
  if (!variants.length) return new Map<string, Media | undefined>();
  const ready = { kind: "image", status: "READY", deletedAt: null } as const;
  const [specific, fallback] = await Promise.all([
    db.variantMedia.findMany({
      where: { variantId: { in: variants.map((v) => v.id) }, media: ready },
      include: { media: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.productMedia.findMany({
      where: {
        productId: { in: variants.map((v) => v.productId) },
        media: ready,
      },
      include: { media: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return new Map(
    variants.map(
      (v) =>
        [
          v.id,
          specific.find((link) => link.variantId === v.id)?.media ??
            fallback.find((link) => link.productId === v.productId)?.media,
        ] as const,
    ),
  );
}
