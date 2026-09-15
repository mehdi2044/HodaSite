import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { storage } from "@/modules/integrations/storage";
import { currentCustomer } from "@/modules/customers";
import { auth } from "@/modules/auth";
import { can, ForbiddenError, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
export async function addReviewPhoto(reviewId: string, file: File) {
  const c = await currentCustomer();
  if (!c || c.isGuest) throw new UnauthorizedError();
  z.string().min(1).max(100).parse(reviewId);
  z.number()
    .int()
    .min(1)
    .max(3 * 1024 * 1024)
    .parse(file.size);
  return withMutation(async () => {
    const review = await db.review.findFirst({
      where: { id: reviewId, customerId: c.id },
      select: { id: true },
    });
    if (!review) throw new ForbiddenError("review.photo");
    const bytes = Buffer.from(await file.arrayBuffer());
    let output: Buffer;
    try {
      const source = sharp(bytes, { limitInputPixels: 24_000_000 });
      const meta = await source.metadata();
      if (
        !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
        (meta.pages ?? 1) > 1
      )
        throw new Error();
      output = await source
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ForbiddenError("review.photo.format");
    }
    const now = new Date(),
      key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.webp`;
    try {
      const url = await storage.put(key, output, "image/webp");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Review" WHERE id=${reviewId} FOR UPDATE`;
        if ((await tx.reviewPhoto.count({ where: { reviewId } })) >= 3)
          throw new ForbiddenError("review.photo.limit");
        const media = await tx.media.create({
          data: {
            kind: "review",
            storageKey: key,
            url,
            originalName: "review.webp",
            bytes: output.length,
            mime: "image/webp",
            altI18n: {},
            variants: {},
          },
        });
        await tx.reviewPhoto.create({ data: { reviewId, mediaId: media.id } });
        await tx.review.update({
          where: { id: reviewId },
          data: {
            status: "PENDING",
            moderatedAt: null,
            moderatedBy: null,
            reply: "",
          },
        });
      });
    } catch (error) {
      await storage.delete(key).catch(() => {});
      throw error;
    }
  });
}
export async function reviewPhotoBytes(id: string) {
  const photo = await db.reviewPhoto.findUnique({
    where: { id },
    include: {
      media: true,
      review: {
        include: {
          customer: { select: { isActive: true } },
          market: { select: { isActive: true, enabledLocales: true } },
          product: {
            select: { status: true, deletedAt: true, marketIds: true },
          },
        },
      },
    },
  });
  if (!photo || photo.media.deletedAt || photo.media.status !== "READY")
    return null;
  const r = photo.review;
  const published =
    r.status === "APPROVED" &&
    r.customer.isActive &&
    r.market.isActive &&
    r.market.enabledLocales.includes(r.locale) &&
    r.product.status === "ACTIVE" &&
    !r.product.deletedAt &&
    r.product.marketIds.includes(r.marketId);
  if (!published) {
    const [customer, admin] = await Promise.all([currentCustomer(), auth()]);
    if (
      customer?.id !== r.customerId &&
      !(admin?.user?.id && (await can(admin.user.id, "content.page.publish")))
    )
      return null;
  }
  return storage.getBytes(photo.media.storageKey);
}
