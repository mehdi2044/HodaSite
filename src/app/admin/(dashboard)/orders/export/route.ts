import { auth } from "@/modules/auth";
import { visibleOrderMarkets } from "@/modules/orders";
import { db } from "@/lib/db";
function cell(s: string) {
  return (
    '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"'
  );
}
export async function GET() {
  const user = (await auth())?.user?.id;
  if (!user) return new Response(null, { status: 401 });
  const markets = await visibleOrderMarkets(user);
  if (!markets.length) return new Response(null, { status: 403 });
  const orders = await db.order.findMany({
    where: { marketId: { in: markets } },
    orderBy: { placedAt: "desc" },
    take: 10000,
  });
  return new Response(
    "\uFEFF" +
      [
        ["number", "status", "amount", "currency", "placedAt"],
        ...orders.map((o) => [
          o.number,
          o.status,
          o.totalAmount.toString(),
          o.currency,
          o.placedAt.toISOString(),
        ]),
      ]
        .map((row) => row.map(cell).join(","))
        .join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=orders.csv",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
