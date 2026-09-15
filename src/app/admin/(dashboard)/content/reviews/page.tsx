import { getLocale, getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/modules/auth/page";
import { db } from "@/lib/db";
import { localized } from "@/lib/seo";
import { EngagementForm } from "@/components/engagement/form";
import { moderateReviewAction } from "./actions";
export default async function ReviewModeration() {
  await requireAdminPage("content.page.publish");
  const [t, locale, reviews] = await Promise.all([
    getTranslations("engagement"),
    getLocale(),
    db.review.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        product: { select: { titleI18n: true } },
        market: { select: { code: true } },
        photos: true,
      },
    }),
  ]);
  return (
    <div className="grid gap-5">
      <h1>{t("moderation")}</h1>
      <p>{t("allReviews")}</p>
      {reviews.map((r) => (
        <article key={r.id} className="card grid gap-3">
          <h2>{localized(r.product.titleI18n, locale)}</h2>
          <p>
            <bdi>
              {r.market.code} / {r.locale} / {r.rating} / 5
            </bdi>{" "}
            —{" "}
            {t(
              r.status === "APPROVED"
                ? "approve"
                : r.status === "REJECTED"
                  ? "reject"
                  : "pending",
            )}
          </p>
          <p className="whitespace-pre-wrap">{r.body}</p>
          <div className="flex flex-wrap gap-3">
            {r.photos.map((p) => (
              <a key={p.id} href={`/api/reviews/photos/${p.id}`}>
                <img
                  src={`/api/reviews/photos/${p.id}`}
                  alt={t("photo")}
                  width={160}
                  height={160}
                  className="h-40 w-40 object-cover"
                />
              </a>
            ))}
          </div>
          <EngagementForm action={moderateReviewAction}>
            <input type="hidden" name="id" value={r.id} />
            <input
              type="hidden"
              name="updatedAt"
              value={r.updatedAt.toISOString()}
            />
            <label>
              {t("reply")}
              <textarea
                className="input w-full"
                name="reply"
                maxLength={2000}
                defaultValue={r.reply}
              />
            </label>
            <div className="flex gap-3">
              <button name="status" value="APPROVED" className="button">
                {t("approve")}
              </button>
              <button name="status" value="REJECTED" className="button">
                {t("reject")}
              </button>
            </div>
          </EngagementForm>
        </article>
      ))}
    </div>
  );
}
