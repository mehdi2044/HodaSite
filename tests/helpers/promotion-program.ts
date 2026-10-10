import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  promotionRevisionSchema,
  type PromotionRevision,
} from "../../src/modules/promotions";
export function promotionInput(
  marketId: string,
  productId: string,
  overrides: Partial<PromotionRevision> = {},
) {
  const config = z
    .object(promotionRevisionSchema.shape)
    .omit({ id: true, revision: true, marketId: true, currency: true })
    .parse({
      enabled: true,
      status: "ACTIVE",
      startsAt: "2020-01-01T00:00:00Z",
      endsAt: null,
      priority: 0,
      group: "checkout",
      stacking: "STACKABLE",
      excludes: [],
      couponRequired: true,
      totalUsageCap: null,
      perCustomerCap: null,
      budget: null,
      definition: {
        version: 1,
        conditions: [],
        selector: {
          productIds: [productId],
          categoryIds: [],
          collectionIds: [],
          excludedProductIds: [],
          excludedCategoryIds: [],
          excludedCollectionIds: [],
        },
        effect: { type: "fixed", amount: "10" },
        maxDiscount: null,
      },
      ...overrides,
    });
  return {
    marketId,
    expectedVersion: 0,
    mutationKey: randomUUID(),
    confirmed: true as const,
    name: "Checkout fixture",
    description: "",
    category: "test",
    ownerNotes: "Disposable test only",
    titleI18n: {
      fa: "تخفیف آزمایشی",
      tr: "Test indirimi",
      en: "Test discount",
    },
    descriptionI18n: { fa: "", tr: "", en: "" },
    config,
  };
}
