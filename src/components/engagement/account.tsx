import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { currentCustomer } from "@/modules/customers";
import { db } from "@/lib/db";
import { EngagementForm } from "./form";
import { stockAlertAction } from "@/app/[locale]/engagement-actions";
import { localized } from "@/lib/seo";
export async function AccountEngagement() {
  const [c, locale, t] = await Promise.all([
    currentCustomer(),
    getLocale(),
    getTranslations("engagement"),
  ]);
  if (!c) return null;
  const alerts = await db.stockAlert.findMany({
    where: { customerId: c.id, active: true },
    include: { variant: { include: { product: true } } },
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="my-8 grid gap-4">
      <Link className="button w-fit" href={`/${locale}/account/wishlist`}>
        {t("wishlist")}
      </Link>
      <h2 className="text-2xl">{t("stockTitle")}</h2>
      {alerts.map((a) => (
        <div key={a.id} className="rounded-token border p-4">
          <p>
            {localized(a.variant.product.titleI18n, locale)} —{" "}
            <bdi>{a.variant.sku}</bdi>
          </p>
          <EngagementForm action={stockAlertAction}>
            <input type="hidden" name="marketId" value={a.marketId} />
            <input type="hidden" name="locale" value={a.locale} />
            <input type="hidden" name="variantId" value={a.variantId} />
            <input type="hidden" name="active" value="false" />
            <button className="button w-fit">{t("unsubscribe")}</button>
          </EngagementForm>
        </div>
      ))}
    </section>
  );
}
