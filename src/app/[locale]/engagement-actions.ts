"use server";
import {
  wishlist,
  mergeWishlist,
  removeWishlist,
  publicCards,
  submitReview,
  setStockAlert,
} from "@/modules/engagement";
import { runAction } from "@/lib/action-result";
export async function readWishlistAction(context: unknown) {
  return wishlist(context);
}
export async function mergeWishlistAction(context: unknown, ids: string[]) {
  return mergeWishlist(context, ids);
}
export async function removeWishlistAction(context: unknown, id: string) {
  return removeWishlist(context, id);
}
export async function publicCardsAction(context: unknown, ids: string[]) {
  return publicCards(context, ids);
}
export async function reviewAction(_: unknown, form: FormData) {
  return runAction(async () => {
    await submitReview(
      { marketId: form.get("marketId"), locale: form.get("locale") },
      {
        productId: form.get("productId"),
        rating: form.get("rating"),
        body: form.get("body"),
      },
    );
  });
}
export async function stockAlertAction(_: unknown, form: FormData) {
  return runAction(async () => {
    await setStockAlert(
      { marketId: form.get("marketId"), locale: form.get("locale") },
      {
        variantId: form.get("variantId"),
        active: form.get("active") === "true",
      },
    );
  });
}
export async function reviewPhotoAction(_: unknown, form: FormData) {
  return runAction(async () => {
    const { addReviewPhoto } = await import("@/modules/engagement/photos");
    const file = form.get("photo");
    if (!(file instanceof File))
      throw new (await import("@/modules/access")).ForbiddenError(
        "review.photo",
      );
    await addReviewPhoto(String(form.get("reviewId") ?? ""), file);
  });
}
