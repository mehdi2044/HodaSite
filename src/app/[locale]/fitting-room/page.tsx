import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentCustomer } from "@/modules/customers";
import { getRequestContext } from "@/lib/request-context";
import {
  fittingConfig,
  walletView,
  fittingProducts,
  savedLooks,
} from "@/modules/fitting";
import { db } from "@/lib/db";
import { FittingRoom } from "@/components/storefront/fitting-room";
import {
  generateFitting,
  readFitting,
  saveFitting,
  addFittingItems,
} from "./actions";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const locale = z.enum(["fa", "tr", "en"]).parse((await params).locale),
    t = await getTranslations("fitting"),
    config = await fittingConfig();
  if (!config.enabled)
    return (
      <main className="shell shop-page py-10">
        <h1>{t("title")}</h1>
        <p className="my-6">{t("disabled")}</p>
        <Link className="button" href={`/${locale}`}>
          {t("back")}
        </Link>
      </main>
    );
  const c = await currentCustomer();
  if (!c || c.isGuest)
    redirect(`/${locale}/account/login?next=/${locale}/fitting-room`);
  const { market } = await getRequestContext(locale);
  const q = (await searchParams).q?.slice(0, 100) ?? "";
  const [wallet, products, owned, saved, media] = await Promise.all([
    walletView(c.id),
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
    <main className="shell shop-page py-10">
      <form className="fitting-search">
        <label>
          {t("search")}
          <input className="input" name="q" defaultValue={q} />
        </label>
        <button className="button">{t("search")}</button>
      </form>
      <FittingRoom
        key={`${c.id}:${market.id}`}
        customerId={c.id}
        marketId={market.id}
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
        saved={saved}
      />
    </main>
  );
}
