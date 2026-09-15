import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { currentCustomer } from "@/modules/customers";
import { publicReviews } from "@/modules/engagement";
import {
  reviewAction,
  stockAlertAction,
} from "@/app/[locale]/engagement-actions";
import { EngagementForm } from "./form";
import { WishlistHeart } from "./wishlist";
import { ReviewPhotos } from "./review-photos";
import { db } from "@/lib/db";
export async function ProductEngagement({
  context,
  productId,
  variants,
  returnPath,
}: {
  context: { marketId: string; locale: "fa" | "tr" | "en" };
  productId: string;
  returnPath: string;
  variants: { id: string; sku: string; available: boolean }[];
}) {
  const [t, c, reviews] = await Promise.all([
    getTranslations("engagement"),
    currentCustomer(),
    publicReviews(context, productId),
  ]);
  const own = c
    ? await db.review.findUnique({
        where: {
          customerId_productId_marketId: {
            customerId: c.id,
            productId,
            marketId: context.marketId,
          },
        },
        include: { photos: true },
      })
    : null;
  const hidden = (
    <>
      <input type="hidden" name="marketId" value={context.marketId} />
      <input type="hidden" name="locale" value={context.locale} />
    </>
  );
  return (
    <section className="my-12 grid gap-6">
      <WishlistHeart productId={productId} />
      <h2 className="text-3xl">{t("reviews")}</h2>
      {reviews.items.map((r) => (
        <article key={r.id} className="grid gap-3 rounded-token border p-5">
          <p aria-label={t("rating")}>
            {r.rating} / 5{" "}
            {r.verifiedPurchase && (
              <span className="ms-3 text-sm">{t("verified")}</span>
            )}
          </p>
          <p className="whitespace-pre-wrap">{r.body}</p>
          <div className="flex flex-wrap gap-3">
            {r.photos.map((photo) => (
              <a key={photo.id} href={`/api/reviews/photos/${photo.id}`}>
                <img
                  src={`/api/reviews/photos/${photo.id}`}
                  alt={t("photo")}
                  loading="lazy"
                  width={160}
                  height={160}
                  className="h-40 w-40 rounded-token object-cover"
                />
              </a>
            ))}
          </div>
          {r.reply && (
            <div className="border-s-2 ps-4">
              <h3>{t("reply")}</h3>
              <p>{r.reply}</p>
            </div>
          )}
        </article>
      ))}
      {!reviews.items.length && <p>{t("empty")}</p>}
      {c && !c.isGuest ? (
        <>
          <p>{t("reviewHint")}</p>
          <EngagementForm action={reviewAction}>
            {hidden}
            <input type="hidden" name="productId" value={productId} />
            <label>
              {t("rating")}
              <select
                name="rating"
                defaultValue={own?.rating ?? 5}
                className="input w-full"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("body")}
              <textarea
                name="body"
                required
                minLength={3}
                maxLength={4000}
                defaultValue={own?.body ?? ""}
                className="input w-full"
              />
            </label>
            <button className="button w-fit">{t("submit")}</button>
          </EngagementForm>
          {own && (
            <ReviewPhotos
              reviewId={own.id}
              photos={own.photos.map((p) => p.id)}
            />
          )}
          {variants
            .filter((v) => !v.available)
            .map((v) => (
              <div
                key={v.id}
                id={`stock-alert-${v.id}`}
                className="scroll-mt-32 border-t pt-4"
              >
                <h3>
                  {t("stockTitle")} — <bdi>{v.sku}</bdi>
                </h3>
                <EngagementForm action={stockAlertAction}>
                  {hidden}
                  <input type="hidden" name="variantId" value={v.id} />
                  <input type="hidden" name="active" value="true" />
                  <button className="button w-fit">{t("subscribe")}</button>
                </EngagementForm>
              </div>
            ))}
        </>
      ) : (
        <div className="grid gap-4">
          <p>
            {t("login")}{" "}
            <Link
              className="underline"
              href={`/${context.locale}/account/login?next=${encodeURIComponent(returnPath)}`}
            >
              {t("signIn")}
            </Link>
          </p>
          {variants
            .filter((v) => !v.available)
            .map((v) => (
              <p key={v.id}>
                {t("stockTitle")} — <bdi>{v.sku}</bdi>{" "}
                <Link
                  className="underline"
                  href={`/${context.locale}/account/login?next=${encodeURIComponent(`${returnPath}#stock-alert-${v.id}`)}`}
                >
                  {t("signIn")}
                </Link>
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
