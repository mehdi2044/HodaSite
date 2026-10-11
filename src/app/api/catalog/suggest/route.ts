import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeSearchText } from "@/modules/catalog";
import {
  catalogCoinPacksEnabled,
  catalogVisibilityWhere,
} from "@/modules/catalog/visibility";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = normalizeSearchText(url.searchParams.get("q") ?? "").slice(0, 80);
  const market = url.searchParams.get("market") ?? "";
  if (q.length < 2 || !market) return NextResponse.json({ items: [] });
  const items = await db.product.findMany({
    where: {
      ...catalogVisibilityWhere(await catalogCoinPacksEnabled()),
      deletedAt: null,
      status: "ACTIVE",
      marketIds: { has: market },
      searchText: { contains: q, mode: "insensitive" },
    },
    select: { id: true, titleI18n: true, slugI18n: true },
    take: 8,
  });
  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
