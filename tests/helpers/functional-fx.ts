import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getActiveRate } from "@/modules/pricing";

/** Another valid TRY market must not become the functional FX reference. */
export async function functionalFxCollision(db: PrismaClient) {
  const reference = await db.market.findUniqueOrThrow({
    where: { code: "TR", currency: "TRY" },
  });
  const rate = (await getActiveRate(reference)).rate;
  const other = await db.market.create({
    data: {
      code: `FX-REFERENCE-${randomUUID()}`,
      name: "Alternate TRY test market",
      currency: "TRY",
      defaultLocale: "en",
      enabledLocales: ["en"],
      roundingRule: {},
      holdHours: 1,
      paymentDeadlineHours: 1,
      fxMode: "AUTO_ACCEPT",
    },
  });
  await db.fxQuote.create({
    data: {
      marketId: other.id,
      baseCurrency: "USD",
      quoteCurrency: "TRY",
      rate: "999",
      provider: "manual",
      status: "ACTIVE",
      acceptedAt: new Date(),
    },
  });
  return { reference, rate, other };
}
