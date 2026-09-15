"use client";
import { useTranslations } from "next-intl";
import { reviewPhotoAction } from "@/app/[locale]/engagement-actions";
import { EngagementForm } from "./form";
export function ReviewPhotos({
  reviewId,
  photos,
}: {
  reviewId: string;
  photos: string[];
}) {
  const t = useTranslations("engagement");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {photos.map((id) => (
          <img
            key={id}
            src={`/api/reviews/photos/${id}`}
            alt={t("photo")}
            width={100}
            height={100}
            className="h-24 w-24 object-cover"
          />
        ))}
      </div>
      {photos.length < 3 && (
        <EngagementForm action={reviewPhotoAction}>
          <input type="hidden" name="reviewId" value={reviewId} />
          <label>
            {t("photos")}
            <input
              className="input w-full"
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <button className="button w-fit">{t("submit")}</button>
        </EngagementForm>
      )}
    </div>
  );
}
