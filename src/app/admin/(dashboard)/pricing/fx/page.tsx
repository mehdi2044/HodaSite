import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input, Select, Table, TD, TH } from "@/components/ui";
import { ActionSubmit } from "@/components/admin/action-submit";
import { CatalogActionForm } from "@/components/admin/catalog-action-form";
import {
  getFxConfiguration,
  isRateStale,
  findEffectiveRate,
} from "@/modules/pricing";
import {
  acceptRate,
  endMarketPrice,
  refreshRates,
  saveFxConfiguration,
  saveManualRate,
  saveMarketPrice,
  saveMarketPricing,
  saveOverride,
} from "./actions";

export default async function FxPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "pricing.fx.manage")))
    redirect("/admin");
  const t = await getTranslations("phase03Admin");
  const [
    markets,
    quotes,
    overrides,
    marketPrices,
    products,
    variants,
    configuration,
    alerts,
  ] = await Promise.all([
    db.market.findMany({ orderBy: { code: "asc" } }),
    db.fxQuote.findMany({
      orderBy: { fetchedAt: "desc" },
      take: 60,
      include: { market: true },
    }),
    db.fxOverride.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { market: true },
    }),
    db.marketPrice.findMany({
      include: { market: true, product: true, variant: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.product.findMany({
      where: { deletedAt: null },
      select: { id: true, titleI18n: true },
      take: 50,
    }),
    db.variant.findMany({
      select: { id: true, sku: true },
      take: 100,
      orderBy: { sku: "asc" },
    }),
    getFxConfiguration(),
    db.systemAlert.findMany({
      where: { code: { startsWith: "FX_" }, resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const effectiveRates = new Map(
    await Promise.all(
      markets.map(
        async (market) =>
          [market.id, await findEffectiveRate(market.id)] as const,
      ),
    ),
  );
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("fxTitle")}</h1>
        <p className="muted mt-1">{t("fxSubtitle")}</p>
      </div>
      {alerts.length > 0 && (
        <Card className="border-warning p-4 text-warning" role="alert">
          <strong>{t("fxAlerts")}</strong>
          <ul className="mt-2 list-disc ps-5">
            {alerts.map((alert) => (
              <li key={alert.id}>{alert.message}</li>
            ))}
          </ul>
        </Card>
      )}
      <form
        action={async () => {
          "use server";
          await refreshRates();
        }}
      >
        <button className="button" type="submit">
          {t("refreshRates")}
        </button>
      </form>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{t("providerSettings")}</h2>
        <CatalogActionForm
          action={saveFxConfiguration}
          submitLabel={t("saveProviderSettings")}
          className="grid gap-3 md:grid-cols-4"
        >
          <Select name="intlProvider" defaultValue={configuration.intlProvider}>
            <option value="frankfurter">Frankfurter</option>
            <option value="manual">{t("manual")}</option>
          </Select>
          <Select name="irtProvider" defaultValue={configuration.irtProvider}>
            <option value="navasan">Navasan</option>
            <option value="manual">{t("manual")}</option>
          </Select>
          <Select name="navasanField" defaultValue={configuration.navasanField}>
            <option value="usd_sell">usd_sell</option>
            <option value="usd_buy">usd_buy</option>
          </Select>
          <Input
            name="refreshHours"
            type="number"
            min="1"
            max="168"
            defaultValue={configuration.refreshHours}
            placeholder={t("refreshHours")}
          />
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={configuration.isActive}
            />
            {t("automaticRefresh")}
          </label>
        </CatalogActionForm>
      </Card>
      <Card className="overflow-auto p-5">
        <h2 className="mb-3 font-semibold">{t("activeMarketPrices")}</h2>
        <Table>
          <thead>
            <tr>
              <TH>{t("market")}</TH>
              <TH>{t("product")}</TH>
              <TH>{t("amount")}</TH>
              <TH>{t("time")}</TH>
              <TH>{t("actions")}</TH>
            </tr>
          </thead>
          <tbody>
            {marketPrices.map((price) => (
              <tr key={price.id}>
                <TD>{price.market.code}</TD>
                <TD>
                  <bdi dir="ltr">
                    {price.variant?.sku ??
                      (price.product?.titleI18n as { fa?: string } | null)
                        ?.fa ??
                      price.productId}
                  </bdi>
                </TD>
                <TD>
                  <bdi dir="ltr">
                    {price.amount.toString()} {price.currency}
                  </bdi>
                </TD>
                <TD>
                  <bdi dir="ltr">
                    {price.validUntil?.toISOString() ?? t("openEnded")}
                  </bdi>
                </TD>
                <TD>
                  {price.isActive &&
                    (!price.validUntil || price.validUntil > new Date()) && (
                      <ActionSubmit
                        action={endMarketPrice}
                        fields={{ id: price.id }}
                        label={t("endOverride")}
                        variant="ghost"
                      />
                    )}
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {markets.map((market) => {
          const active = effectiveRates.get(market.id);
          const newest = quotes.find(
            (quote) =>
              quote.marketId === market.id && quote.status === "SUGGESTED",
          );
          const stale = isRateStale(active?.at, market.fxStaleHours);
          const history = quotes
            .filter((quote) => quote.marketId === market.id)
            .slice(0, 12)
            .reverse();
          const historyValues = history.map((quote) => Number(quote.rate));
          const historyMin = Math.min(...historyValues);
          const historyMax = Math.max(...historyValues);
          const historyRange = historyMax - historyMin;
          return (
            <Card key={market.id} className="grid gap-3 p-5">
              <h2 className="font-semibold">
                {market.code} · {market.currency}
              </h2>
              <p>
                {t("activeRate")}:{" "}
                <bdi dir="ltr" className="font-semibold">
                  {active?.rate.toString() ?? "—"}
                </bdi>
              </p>
              <p>
                {t("suggestedRate")}:{" "}
                <bdi dir="ltr" className="font-semibold">
                  {newest?.rate.toString() ?? "—"}
                </bdi>
              </p>
              {stale && (
                <p className="rounded-token bg-warning/10 p-2 text-sm text-warning">
                  {t("staleRate")}
                </p>
              )}
              {history.length > 1 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">{t("rateChart")}</h3>
                  <div
                    className="flex h-24 items-end gap-1 rounded-token bg-surface p-2"
                    role="img"
                    aria-label={t("rateChartFor", { market: market.code })}
                  >
                    {history.map((quote, index) => {
                      const rate = historyValues[index];
                      const height =
                        historyRange === 0
                          ? 50
                          : 15 + ((rate - historyMin) / historyRange) * 85;
                      return (
                        <span
                          key={quote.id}
                          className="min-w-1 flex-1 rounded-t-sm bg-primary"
                          style={{ height: `${height}%` }}
                          title={`${quote.fetchedAt.toISOString()} · ${quote.rate.toString()}`}
                        />
                      );
                    })}
                  </div>
                  <div className="muted mt-1 flex justify-between text-xs">
                    <bdi dir="ltr">{history[0]?.rate.toString()}</bdi>
                    <bdi dir="ltr">{history.at(-1)?.rate.toString()}</bdi>
                  </div>
                </div>
              )}
              {newest && (
                <ActionSubmit
                  action={acceptRate}
                  fields={{ id: newest.id }}
                  label={t("acceptSuggested")}
                />
              )}
              <CatalogActionForm
                action={saveManualRate}
                submitLabel={t("saveManualRate")}
                className="grid gap-2"
              >
                <input type="hidden" name="marketId" value={market.id} />
                <Input
                  name="rate"
                  required
                  placeholder={t("usdRate")}
                  dir="ltr"
                />
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="confirm" required />
                  {t("confirmRateChange")}
                </label>
              </CatalogActionForm>
              <CatalogActionForm
                action={saveMarketPricing}
                submitLabel={t("saveMarketSettings")}
                className="grid gap-2"
              >
                <input type="hidden" name="marketId" value={market.id} />
                <label>
                  {t("fxMode")}
                  <Select name="fxMode" defaultValue={market.fxMode}>
                    <option value="AUTO_ACCEPT">{t("autoAccept")}</option>
                    <option value="REQUIRE_APPROVAL">
                      {t("requireApproval")}
                    </option>
                  </Select>
                </label>
                <Input
                  name="markupPercent"
                  defaultValue={market.markupPercent.toString()}
                  placeholder={t("markupPercent")}
                />
                <Input
                  name="fxMaxJumpPercent"
                  defaultValue={market.fxMaxJumpPercent.toString()}
                  placeholder={t("jumpLimit")}
                />
                <Input
                  name="fxStaleHours"
                  defaultValue={market.fxStaleHours}
                  placeholder={t("staleHours")}
                />
                <Input
                  name="volumetricDivisor"
                  defaultValue={market.volumetricDivisor}
                  placeholder={t("volumetricDivisor")}
                />
                <Select
                  name="roundingMode"
                  defaultValue={
                    (market.roundingRule as { mode?: string }).mode ?? "HALF_UP"
                  }
                >
                  {["HALF_UP", "HALF_EVEN", "NEAREST", "UP", "DOWN"].map(
                    (mode) => (
                      <option key={mode}>{mode}</option>
                    ),
                  )}
                </Select>
                <Input
                  name="roundingIncrement"
                  defaultValue={
                    (market.roundingRule as { increment?: string }).increment ??
                    "0.01"
                  }
                  placeholder={t("roundingIncrement")}
                />
                <Input
                  name="roundingEnding"
                  defaultValue={
                    (market.roundingRule as { ending?: string }).ending ?? ""
                  }
                  placeholder={t("roundingEnding")}
                />
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    name="taxIncluded"
                    defaultChecked={market.priceIncludesTax}
                  />
                  {t("taxIncludedSetting")}
                </label>
              </CatalogActionForm>
            </Card>
          );
        })}
      </div>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{t("timedOverride")}</h2>
        <CatalogActionForm
          action={saveOverride}
          className="grid gap-3 md:grid-cols-3"
        >
          <Select name="marketId">
            {markets.map((market) => (
              <option value={market.id} key={market.id}>
                {market.code}
              </option>
            ))}
          </Select>
          <Input name="rate" required placeholder={t("rate")} />
          <Input name="note" required placeholder={t("note")} />
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" name="confirm" required />
            {t("confirmRateChange")}
          </label>
          <Input name="validFrom" type="datetime-local" required />
          <Input name="validUntil" type="datetime-local" />
          <span />
          <span className="md:col-span-3" />
        </CatalogActionForm>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{t("manualMarketPrice")}</h2>
        <CatalogActionForm
          action={saveMarketPrice}
          className="grid gap-3 md:grid-cols-3"
        >
          <Select name="marketId">
            {markets.map((market) => (
              <option value={market.id} key={market.id}>
                {market.code}
              </option>
            ))}
          </Select>
          <Select name="targetType">
            <option value="product">{t("product")}</option>
            <option value="variant">{t("variant")}</option>
          </Select>
          <Select name="targetId">
            <optgroup label={t("product")}>
              {products.map((product) => (
                <option value={product.id} key={product.id}>
                  {(product.titleI18n as { fa?: string }).fa ?? product.id}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("variant")}>
              {variants.map((variant) => (
                <option value={variant.id} key={variant.id}>
                  {variant.sku}
                </option>
              ))}
            </optgroup>
          </Select>
          <Input name="amount" required placeholder={t("amount")} />
          <Input name="compareAtAmount" placeholder={t("compareAt")} />
          <Input name="validFrom" type="datetime-local" required />
          <Input name="validUntil" type="datetime-local" />
          <span />
          <span />
        </CatalogActionForm>
      </Card>
      <Card className="overflow-auto p-5">
        <h2 className="mb-3 font-semibold">{t("rateHistory")}</h2>
        <Table>
          <thead>
            <tr>
              <TH>{t("market")}</TH>
              <TH>{t("rate")}</TH>
              <TH>{t("source")}</TH>
              <TH>{t("status")}</TH>
              <TH>{t("time")}</TH>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id}>
                <TD>{quote.market.code}</TD>
                <TD>
                  <bdi dir="ltr">{quote.rate.toString()}</bdi>
                </TD>
                <TD>
                  {quote.provider}
                  {quote.sourceField ? ` · ${quote.sourceField}` : ""}
                </TD>
                <TD>{quote.status}</TD>
                <TD>
                  <bdi dir="ltr">{quote.fetchedAt.toISOString()}</bdi>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {overrides.length > 0 && (
        <p className="muted">
          {t("overrideCount", { count: overrides.length })}
        </p>
      )}
    </div>
  );
}
