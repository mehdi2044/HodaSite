import Link from "next/link";
import { getMarkets } from "@/modules/settings";
import { Card, Table, TH, TD, Badge } from "@/components/ui";

const NAMES: Record<string, string> = {
  IR: "ایران",
  TR: "ترکیه",
  CA: "کانادا",
};

export default async function MarketsPage() {
  const markets = await getMarkets();

  return (
    <>
      <h1 className="text-2xl font-semibold">بازارها</h1>
      <Card className="mt-4">
        <Table>
          <thead>
            <tr>
              <TH>بازار</TH>
              <TH>ارز</TH>
              <TH>زبان پیش‌فرض</TH>
              <TH>زبان‌های فعال</TH>
              <TH>وضعیت</TH>
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
                    {m.isActive ? "فعال" : "غیرفعال"}
                  </Badge>
                  {m.salesPaused && (
                    <Badge tone="warning" className="ms-2">
                      فروش متوقف
                    </Badge>
                  )}
                </TD>
                <TD>
                  <Link
                    href={`/admin/markets/${m.id}`}
                    className="text-primary"
                  >
                    ویرایش
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
