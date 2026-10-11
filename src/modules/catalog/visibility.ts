import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readConfig } from "@/modules/fitting/ledger";

export async function catalogCoinPacksEnabled(
  client: Prisma.TransactionClient = db,
) {
  const config = await readConfig(client);
  return config.enabled && config.coinSalesEnabled;
}

/** Live storefront eligibility; authorized admin preview remains a separate lookup. */
export function catalogVisibilityWhere(
  allowCoinPacks: boolean,
): Prisma.ProductWhereInput {
  return allowCoinPacks
    ? {
        OR: [
          { coinPackCoins: null },
          { variants: { some: { isActive: true } } },
        ],
      }
    : { coinPackCoins: null };
}
