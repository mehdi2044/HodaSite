import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fittingConfig } from "@/modules/fitting";
import { db } from "@/lib/db";
import { getRequestContext } from "@/lib/request-context";
import { getDisplayPrice } from "@/modules/pricing";
import { catalogText, formatCatalogCurrency } from "@/modules/catalog";
import { seoPath } from "@/lib/seo-urls";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = z.enum(["fa", "tr", "en"]).parse((await params).locale),
    t = await getTranslations("fitting"),
    c = await fittingConfig(),
    { market } = await getRequestContext(locale);
  const packs =
    c.enabled && c.coinSalesEnabled
      ? await db.product.findMany({
          where: {
            coinPackCoins: { gt: 0 },
            deletedAt: null,
            status: "ACTIVE",
            marketIds: { has: market.id },
            variants: { some: { isActive: true } },
          },
          include: {
            variants: { where: { isActive: true }, take: 1 },
            media: { include: { media: true }, orderBy: { sortOrder: "asc" } },
          },
          orderBy: { coinPackCoins: "asc" },
        })
      : [];
  return (
    <main className="shell shop-page py-10">
      <header className="fitting-heading">
        <div>
          <h1>{t("buyCoins")}</h1>
          <p>{t("packsHelp")}</p>
        </div>
        <Link href={`/${locale}/fitting-room`}>{t("backToRoom")} ↗</Link>
      </header>
      <div className="fitting-packs">
        {packs.length ? (
          await Promise.all(
            packs.map(async (p) => {
              const price = await getDisplayPrice(p, p.variants[0], market);
              return (
                <article key={p.id}>
                  <span>
                    {p.coinPackCoins?.toString()} <small>{t("coins")}</small>
                  </span>
                  <h2>{catalogText(p.titleI18n, locale)}</h2>
                  <strong>
                    {formatCatalogCurrency(
                      price.amount,
                      market.currency as "IRT" | "TRY" | "CAD",
                      locale,
                    )}
                  </strong>
                  <Link
                    className="button"
                    href={seoPath(
                      locale,
                      market.code,
                      "p",
                      catalogText(p.slugI18n, locale),
                    )}
                  >
                    {t("choosePack")} ↗
                  </Link>
                </article>
              );
            }),
          )
        ) : (
          <p>{t("packsDisabled")}</p>
        )}
      </div>
    </main>
  );
}
