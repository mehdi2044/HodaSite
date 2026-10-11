import { getTranslations } from "next-intl/server";
import { CommerceForm } from "./commerce-form";
import { saveCouponsAction } from "@/app/[locale]/commerce-actions";
import { MAX_COUPON_INPUT_LENGTH } from "@/modules/promotions/coupon-contracts";
export async function CouponForm({
  locale,
  revision,
  codes,
}: {
  locale: string;
  revision: number;
  codes: unknown;
}) {
  const t = await getTranslations("commerce");
  return (
    <CommerceForm
      action={saveCouponsAction.bind(null, locale)}
      className="shop-coupon-form my-5 grid gap-3 rounded-token border border-black/10 p-4"
    >
      <input type="hidden" name="revision" value={revision} />
      <label className="grid gap-2 text-sm font-semibold">
        {t("couponCodes")}
        <input
          className="input w-full min-w-0"
          name="coupons"
          dir="ltr"
          maxLength={MAX_COUPON_INPUT_LENGTH}
          defaultValue={
            Array.isArray(codes)
              ? codes.filter((x) => typeof x === "string").join(", ")
              : ""
          }
          autoCapitalize="characters"
          autoComplete="off"
        />
      </label>
      <p className="text-sm text-muted">{t("couponHelp")}</p>
      <button className="button" type="submit">
        {t("applyCoupons")}
      </button>
    </CommerceForm>
  );
}
