import { InstantFitting } from "@/components/storefront/instant-fitting";
import { storeCutoutModels } from "@/modules/catalog/cutouts/models";
import { cutoutPublicImage } from "@/modules/catalog/cutouts/resolve";
import { instantCatalog, instantLooks } from "@/modules/fitting/instant";
import {
  coinBalance,
  usableGrants,
  walletDebt,
} from "@/modules/fitting/ledger";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentCustomer } from "@/modules/customers";
import { getRequestContext } from "@/lib/request-context";
import { fittingConfig, fittingProducts, savedLooks } from "@/modules/fitting";
import { db } from "@/lib/db";
import { FittingRoom } from "@/components/storefront/fitting-room";
import {
  generateFitting,
  readFitting,
  saveFitting,
  addFittingItems,
  loadFittingVariants,
} from "./actions";
export const dynamic = "force-dynamic";
async function PaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const locale = z.enum(["fa", "tr", "en"]).parse((await params).locale),
    t = await getTranslations("fitting"),
    config = await fittingConfig(),
    c = await currentCustomer();
  if (!config.enabled && (!c || c.isGuest))
    return (
      <section className="shell shop-page py-10">
        <h1>{t("title")}</h1>
        <p className="my-6">{t("disabled")}</p>
        <Link className="button" href={`/${locale}`}>
          {t("back")}
        </Link>
      </section>
    );
  if (!c || c.isGuest)
    redirect(`/${locale}/account/login?next=/${locale}/fitting-room`);
  const { market } = await getRequestContext(locale);
  const q = (await searchParams).q?.slice(0, 100) ?? "";
  const [wallet, products, owned, saved, media] = await Promise.all([
    db.$transaction(
      async (tx) => {
        const grants = await usableGrants(tx, c.id, new Date());
        const wallet = await tx.fittingWallet.findUnique({
          where: { customerId: c.id },
        });
        const total = coinBalance(grants).sub(
          wallet ? await walletDebt(tx, c.id) : "0",
        );
        const balance = total.lt(0) ? "0" : total.toFixed();
        return {
          balance,
          dailyExpires:
            grants
              .find((g) => g.reason === "DAILY")
              ?.expiresAt?.toISOString() ?? null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    ),
    fittingProducts(c.id, market.id, locale, q),
    fittingProducts(c.id, market.id, locale, "", true),
    savedLooks(c.id),
    db.media.findMany({
      where: {
        id: {
          in: config.models.filter((m) => m.enabled).map((m) => m.mediaId),
        },
        deletedAt: null,
        status: "READY",
        kind: "image",
      },
    }),
  ]);
  const models = config.models.flatMap((m) => {
    const im = media.find((i) => i.id === m.mediaId);
    return m.enabled && im
      ? [{ id: m.id, label: m.label[locale], kind: m.kind, url: im.url }]
      : [];
  });
  const keys = [
    "eyebrow",
    "title",
    "disabled",
    "subtitle",
    "balance",
    "coins",
    "dailyExpiry",
    "buyCoins",
    "models",
    "generated",
    "modelReference",
    "imageHelp",
    "lookName",
    "saveLook",
    "saved",
    "shop",
    "wardrobe",
    "wardrobeHelp",
    "selectionHelp",
    "owned",
    "priceUnavailable",
    "colorSize",
    "choose",
    "moreVariants",
    "moreProducts",
    "loadingVariants",
    "unavailable",
    "emptyWardrobe",
    "selection",
    "remove",
    "cost",
    "chargeHelp",
    "working",
    "retry",
    "generate",
    "addNew",
    "added",
    "savedLooks",
    "error",
    "requestUnknown",
    "status_QUEUED",
    "status_RUNNING",
    "status_DONE",
    "status_FAILED",
    "status_REVIEW",
    "error_INSUFFICIENT_COINS",
    "error_DAILY_LIMIT",
    "error_INVALID_COMBINATION",
    "error_PROVIDER_UNAVAILABLE",
    "error_DISABLED",
    "error_REQUEST_CONFLICT",
    "error_CHARGE_CHANGED",
  ];
  return (
    <section className="shell shop-page py-10">
      {config.enabled && (
        <form className="fitting-search">
          <label>
            {t("search")}
            <input className="input" name="q" defaultValue={q} />
          </label>
          <button className="button">{t("search")}</button>
        </form>
      )}
      <FittingRoom
        key={`${c.id}:${market.id}:${locale}`}
        customerId={c.id}
        marketId={market.id}
        enabled={config.enabled}
        models={models}
        products={products}
        ownedProducts={owned}
        locale={locale}
        currency={market.currency as "IRT" | "TRY" | "CAD"}
        costCoins={config.costCoins}
        balance={wallet.balance}
        dailyExpires={wallet.dailyExpires}
        labels={Object.fromEntries(keys.map((k) => [k, t(k)]))}
        generate={generateFitting.bind(null, locale)}
        readSession={readFitting}
        save={saveFitting}
        addToBag={addFittingItems.bind(null, locale)}
        loadVariants={loadFittingVariants.bind(null, locale)}
        searchQuery={q}
        saved={saved}
      />
    </section>
  );
}

export default async function Page(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const locale = z.enum(["fa", "tr", "en"]).parse((await props.params).locale),
    config = await fittingConfig(),
    customer = await currentCustomer();
  if (!config.instantEnabled) return <main>{await PaidPage(props)}</main>;
  const { market } = await getRequestContext(locale);
  const [models, products, saved, archived] = await Promise.all([
    storeCutoutModels(),
    instantCatalog(market.id, locale),
    customer && !customer.isGuest ? instantLooks(locale) : [],
    customer && !customer.isGuest ? instantLooks(locale, true) : [],
  ]);
  const showPaid = !!customer && !customer.isGuest;
  return (
    <>
      <main className="shell shop-page py-10">
        <InstantFitting
          key={`${customer?.id ?? "guest"}:${market.id}:${locale}`}
          locale={locale}
          marketId={market.id}
          currency={market.currency as "IRT" | "TRY" | "CAD"}
          customerId={customer && !customer.isGuest ? customer.id : null}
          models={models.map((m) => ({
            id: m.id,
            label: m.label,
            kind: m.kind,
            media: cutoutPublicImage(m.image),
          }))}
          products={products}
          saved={saved}
          archived={archived}
          primaryHeading={!showPaid}
        />
        {showPaid && (await PaidPage(props))}
      </main>
    </>
  );
}
