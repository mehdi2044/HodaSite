import type { PrismaClient } from "@prisma/client";
/** Demo/setup values only; changes in the admin are preserved on seed reruns. */
export async function seedShipping(db: PrismaClient) {
  for (const market of await db.market.findMany({
    where: { code: { in: ["TR", "IR", "CA"] } },
  })) {
    const domestic = {
      fa: "ارسال داخلی",
      tr: "Yurt içi teslimat",
      en: "Domestic delivery",
    };
    const international = {
      fa: "ارسال بین‌المللی",
      tr: "Uluslararası teslimat",
      en: "International delivery",
    };
    const id = `shipping-default-${market.id}`;
    await db.shippingWorkflow.upsert({
      where: { id },
      update: {},
      create: {
        id,
        marketId: market.id,
        nameI18n: {
          fa: "ارسال استاندارد",
          tr: "Standart teslimat",
          en: "Standard delivery",
        },
        isDefault: true,
        legs: {
          create:
            market.code === "TR"
              ? [{ sortOrder: 0, type: "DOMESTIC", labelI18n: domestic }]
              : [
                  {
                    sortOrder: 0,
                    type: "INTERNATIONAL",
                    labelI18n: international,
                  },
                  { sortOrder: 1, type: "DOMESTIC", labelI18n: domestic },
                ],
        },
      },
    });
    if (market.code === "CA")
      await db.shippingWorkflow.upsert({
        where: { id: `shipping-door-${market.id}` },
        update: {},
        create: {
          id: `shipping-door-${market.id}`,
          marketId: market.id,
          nameI18n: {
            fa: "درب تا درب",
            tr: "Kapıdan kapıya",
            en: "Door-to-door",
          },
          legs: {
            create: {
              sortOrder: 0,
              type: "INTERNATIONAL",
              labelI18n: international,
            },
          },
        },
      });
  }
}
