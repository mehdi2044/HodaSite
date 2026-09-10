import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { quoteCart } from "@/modules/fees";
import { Card, Input, Select, Table, TD, TH } from "@/components/ui";

type Query = {
  marketId?: string;
  variantId1?: string;
  variantId2?: string;
  variantId3?: string;
  quantity1?: string;
  quantity2?: string;
  quantity3?: string;
  province?: string;
  city?: string;
  postalCode?: string;
};

export default async function FeeSimulator({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "fees.manage")))
    redirect("/admin");
  const t = await getTranslations("phase03Admin");
  const query = await searchParams;
  const [markets, variants] = await Promise.all([
    db.market.findMany({ orderBy: { code: "asc" } }),
    db.variant.findMany({
      include: { product: true },
      orderBy: { sku: "asc" },
      take: 200,
    }),
  ]);
  const items = ([1, 2, 3] as const).flatMap((index) => {
    const variantId = query[`variantId${index}`];
    if (!variantId) return [];
    return [
      {
        variantId,
        quantity: Math.max(
          1,
          Number.parseInt(query[`quantity${index}`] ?? "1", 10),
        ),
      },
    ];
  });
  let result: Awaited<ReturnType<typeof quoteCart>> | null = null;
  let error = "";
  if (query.marketId && items.length > 0) {
    try {
      result = await quoteCart({
        marketId: query.marketId,
        locale: "fa",
        items,
        address: {
          province: query.province,
          city: query.city,
          postalCode: query.postalCode,
        },
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : t("quoteError");
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("simulatorTitle")}</h1>
        <p className="muted mt-1">{t("simulatorSubtitle")}</p>
      </div>
      <Card className="p-5">
        <form method="get" className="grid gap-3 md:grid-cols-3">
          <Select name="marketId" defaultValue={query.marketId}>
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.code}
              </option>
            ))}
          </Select>
          {([1, 2, 3] as const).map((index) => (
            <div className="contents" key={index}>
              <Select
                name={`variantId${index}`}
                defaultValue={query[`variantId${index}`]}
              >
                <option value="">{t("noItem")}</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.sku} ·{" "}
                    {(variant.product.titleI18n as { fa?: string }).fa}
                  </option>
                ))}
              </Select>
              <Input
                name={`quantity${index}`}
                type="number"
                min="1"
                defaultValue={query[`quantity${index}`] ?? "1"}
              />
            </div>
          ))}
          <Input
            name="province"
            placeholder={t("province")}
            defaultValue={query.province}
          />
          <Input
            name="city"
            placeholder={t("city")}
            defaultValue={query.city}
          />
          <Input
            name="postalCode"
            placeholder={t("postalCode")}
            defaultValue={query.postalCode}
          />
          <button className="button" type="submit">
            {t("calculate")}
          </button>
        </form>
      </Card>
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <Card className="p-5" data-testid="fee-quote">
          <p>
            {t("chargeableWeight")}:{" "}
            <bdi dir="ltr">{result.chargeableWeightKg} kg</bdi>
          </p>
          <p>
            {t("itemsSubtotal")}:{" "}
            <bdi dir="ltr">
              {result.subtotal} {result.currency}
            </bdi>
          </p>
          <Table>
            <thead>
              <tr>
                <TH>{t("type")}</TH>
                <TH>{t("amount")}</TH>
                <TH>{t("matchedRule")}</TH>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => (
                <tr key={line.ruleId}>
                  <TD>{line.type}</TD>
                  <TD>
                    <bdi dir="ltr">{line.chargedAmount}</bdi>
                  </TD>
                  <TD>
                    {line.label} · <bdi dir="ltr">{line.explanation}</bdi>
                    {line.absorbed ? ` · ${t("absorbedShort")}` : ""}
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-lg font-semibold">
            {t("total")}:{" "}
            <bdi dir="ltr">
              {result.total} {result.currency}
            </bdi>
          </p>
        </Card>
      )}
    </div>
  );
}
