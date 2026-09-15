import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getMarkets } from "@/modules/settings";
import { Card, Table, TH, TD, Badge } from "@/components/ui";

export default async function MarketsPage() {
  const legacy = await getTranslations("foundationAdmin");
  const NAMES: Record<string, string> = {
    IR: legacy("iran"),
    TR: legacy("turkey"),
    CA: legacy("canada"),
  };
  const markets = await getMarkets();

  return (
    <>
      <a className="underline" href="/admin/settings/invoices">
        {(await getTranslations("invoice"))("settings")}
      </a>
      <h1 className="text-2xl font-semibold">{legacy("markets")}</h1>
      <Card className="mt-4">
        <Table>
          <thead>
            <tr>
              <TH>{legacy("market")}</TH>
              <TH>{legacy("currency")}</TH>
              <TH>{legacy("defaultLocale")}</TH>
              <TH>{legacy("enabledLocales")}</TH>
              <TH>{legacy("status")}</TH>
              <TH></TH>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.id}>
                <TD>{NAMES[m.code] ?? m.code}</TD>
                <TD dir="ltr">{m.currency}</TD>
                <TD dir="ltr">{m.defaultLocale}</TD>
                <TD dir="ltr">{m.enabledLocales.join(", ")}</TD>
                <TD>
                  <Badge tone={m.isActive ? "success" : "neutral"}>
                    {m.isActive ? legacy("active") : legacy("inactive")}
                  </Badge>
                  {m.salesPaused && (
                    <Badge tone="warning" className="ms-2">
                      {" "}
                      {legacy("salesPaused")}{" "}
                    </Badge>
                  )}
                </TD>
                <TD>
                  <Link
                    href={`/admin/markets/${m.id}`}
                    className="text-primary"
                  >
                    {" "}
                    {legacy("edit")}{" "}
                  </Link>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
