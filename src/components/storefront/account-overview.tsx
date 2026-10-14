import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentCustomer } from "@/modules/customers";
import { getRequestContext } from "@/lib/request-context";
import {
  coinBalance,
  usableGrants,
  walletDebt,
} from "@/modules/fitting/ledger";
import { savedLooks } from "@/modules/fitting";
import { resolveContentTarget } from "@/modules/content/moda4-targets";
import { ResponsiveImage } from "./responsive-image";
const STEPS = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;
export async function AccountOverview({
  locale,
  children,
}: {
  locale: "fa" | "tr" | "en";
  children?: React.ReactNode;
}) {
  const actor = await currentCustomer();
  if (!actor || actor.isGuest) return null;
  const t = await getTranslations("accountDesign"),
    commerce = await getTranslations("commerce");
  const { market } = await getRequestContext(locale);
  const [orders, wishlist, looks, balance, fitting, looksCount] =
    await Promise.all([
      db.order.findMany({
        where: {
          customerId: actor.id,
          marketId: market.id,
          status: { in: [...STEPS, "AWAITING_VERIFICATION", "NEEDS_REVIEW"] },
        },
        orderBy: { placedAt: "desc" },
        take: 1,
      }),
      db.wishlist.count({
        where: { customerId: actor.id, marketId: market.id },
      }),
      savedLooks(actor.id),
      db.$transaction(
        async (tx) => {
          const wallet = await tx.fittingWallet.findUnique({
            where: { customerId: actor.id },
          });
          const grants = await usableGrants(tx, actor.id, new Date());
          const current = coinBalance(grants).sub(
            wallet ? await walletDebt(tx, actor.id) : "0",
          );
          return current.lt(0) ? "0" : current.toFixed();
        },
        { isolationLevel: "RepeatableRead" },
      ),
      resolveContentTarget({ kind: "fitting" }, market.id, locale),
      db.fittingSession.count({
        where: { customerId: actor.id, savedAt: { not: null }, status: "DONE" },
      }),
    ]);
  const inTransit = await db.order.count({
    where: {
      customerId: actor.id,
      marketId: market.id,
      status: { in: ["PAID", "PROCESSING", "SHIPPED"] },
    },
  });
  const order = orders[0],
    progress = order
      ? Math.max(
          0,
          STEPS.findIndex((status) => status === order.status),
        )
      : 0;
  return (
    <>
      <section className="moda-profile-cover" id="overview">
        <div className="moda-profile-avatar" aria-hidden="true">
          {(actor.firstName || actor.email)
            .slice(0, 1)
            .toLocaleUpperCase(locale)}
        </div>
        <div>
          <h2>
            {actor.firstName
              ? `${actor.firstName} ${actor.lastName}`.trim()
              : t("welcome")}
          </h2>
          <p>{t("yourSpace")}</p>
        </div>
      </section>
      <div className="moda-account-layout">
        <nav className="moda-account-nav" aria-label={t("navigation")}>
          <a href="#overview" aria-current="page">
            {t("overview")}
          </a>
          <a href="#appearance">{t("appearance")}</a>
          <a href="#personal-details">{commerce("profile")}</a>
          <a href="#orders">{commerce("orders")}</a>
          <a href="#wardrobe">{t("wardrobe")}</a>
          <Link href={`/${locale}/account/wishlist`}>
            {commerce("wishlist")}
          </Link>
          <Link href={`/${locale}/account/preferences`}>
            {commerce("privacy")}
          </Link>
        </nav>
        <div className="moda-account-content">
          <p className="text-sm text-muted">
            {t("marketScope", { market: market.code })}
          </p>
          <dl className="moda-profile-stats">
            {[
              [t("inTransit"), String(inTransit)],
              [t("coins"), balance],
              [commerce("wishlist"), String(wishlist)],
              [t("savedAiLooks"), String(looksCount)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <bdi>{value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {order && (
            <section className="moda-account-panel">
              <h2>{t("latestOrder")}</h2>
              <Link href={`/${locale}/orders/${order.number}/pay`}>
                <bdi>{order.number}</bdi> ·{" "}
                {commerce(`statuses.${order.status}`)}
              </Link>
              <ol className="moda-order-timeline">
                {STEPS.map((status, index) => (
                  <li
                    key={status}
                    data-reached={index <= progress}
                    aria-current={index === progress ? "step" : undefined}
                  >
                    {commerce(`statuses.${status}`)}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section id="wardrobe" className="moda-account-panel">
            <h2>{t("wardrobe")}</h2>
            <p>{t("aiWardrobeHelp")}</p>
            <div className="moda-wardrobe-grid">
              {looks.map((look) => (
                <Link key={look.id} href={`/${locale}/fitting-room`}>
                  <ResponsiveImage
                    media={{
                      url: look.imageUrl,
                      variants: {},
                      width: null,
                      height: null,
                      blurDataUrl: null,
                      altI18n: { [locale]: look.name || t("savedAiLooks") },
                      presentation: { fit: "contain" },
                    }}
                    locale={locale}
                    role="catalog"
                    sizes="(max-width:767px) 50vw,25vw"
                    className="block aspect-[3/4]"
                    imgClassName="h-full w-full object-contain"
                  />
                  <span>{look.name || t("savedAiLooks")}</span>
                </Link>
              ))}
              {fitting && (
                <Link className="moda-new-look" href={fitting}>
                  {t("newLook")}
                </Link>
              )}
            </div>
            {!looks.length && <p>{t("noLooks")}</p>}
          </section>
          {children}
        </div>
      </div>
    </>
  );
}
