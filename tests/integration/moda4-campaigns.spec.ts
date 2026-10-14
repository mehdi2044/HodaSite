import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));
import { savePromotionProgram } from "@/modules/promotions/persistence";
import { evaluateStoredPromotions } from "@/modules/promotions/evidence";
import { resolvePublicCampaign } from "@/modules/content/campaigns";
import { setMaintenanceFlag } from "@/modules/settings";
import type { PromotionRevision } from "@/modules/promotions/contracts";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b campaign display agrees with existing stored promotion engine",
  () => {
    const markets: string[] = [];
    beforeAll(async () => {
      setMaintenanceFlag(false);
      actor.id = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
    });
    afterAll(async () => {
      await db.market.updateMany({
        where: { id: { in: markets } },
        data: { isActive: false },
      });
    });
    async function fixture(overrides: Partial<PromotionRevision> = {}) {
      const market = await db.market.create({
        data: {
          code: `CMS-${randomUUID().slice(0, 8)}`,
          name: "Campaign fixture",
          currency: "USD",
          defaultLocale: "en",
          enabledLocales: ["fa", "tr", "en"],
          roundingRule: { scale: 2 },
          holdHours: 3,
          paymentDeadlineHours: 48,
          fxMode: "REQUIRE_APPROVAL",
        },
      });
      markets.push(market.id);
      const saved = await savePromotionProgram({
        marketId: market.id,
        expectedVersion: 0,
        mutationKey: randomUUID(),
        confirmed: true,
        name: "Campaign fixture",
        description: "",
        category: "fixture",
        ownerNotes: "PRIVATE_INTERNAL_FIXTURE",
        titleI18n: { fa: "تخفیف", tr: "İndirim", en: "Offer" },
        descriptionI18n: { fa: "", tr: "", en: "" },
        config: {
          enabled: true,
          status: "ACTIVE",
          startsAt: "2020-01-01T00:00:00Z",
          endsAt: null,
          priority: 0,
          group: "all",
          stacking: "STACKABLE",
          excludes: [],
          couponRequired: false,
          totalUsageCap: null,
          perCustomerCap: null,
          budget: null,
          definition: {
            version: 1,
            conditions: [],
            selector: {
              productIds: [],
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
        },
      });
      const quote = () =>
        evaluateStoredPromotions(
          db,
          {
            marketId: market.id,
            currency: "USD",
            locale: "en",
            items: [
              {
                variantId: "fixture-variant",
                productId: "fixture-product",
                categoryId: null,
                collectionIds: [],
                quantity: 1,
                unitPrice: "100",
              },
            ],
            shippingAmount: "0",
          },
          null,
          [],
          false,
        );
      const view = () =>
        resolvePublicCampaign(saved.id, market.id, market.currency, "en");
      return { market, saved, quote, view };
    }
    it("uses real database time before, during and after the immutable program window", async () => {
      for (const [overrides, state, total] of [
        [{ startsAt: "2090-01-01T00:00:00Z" }, "UPCOMING", "0.0000"],
        [{}, "ACTIVE", "10.0000"],
        [{ endsAt: "2021-01-01T00:00:00Z" }, "ENDED", "0.0000"],
      ] as const) {
        const f = await fixture(overrides);
        const view = await f.view();
        expect(view?.state).toBe(state);
        expect((await f.quote()).result.discountTotal).toBe(total);
        expect(Number.isNaN(Date.parse(view!.now))).toBe(false);
        expect(JSON.stringify(view)).not.toContain("PRIVATE_INTERNAL_FIXTURE");
        expect(JSON.stringify(view)).not.toContain("definition");
      }
    });
    it("hides paused, draft and foreign-market/currency offers", async () => {
      for (const status of ["PAUSED", "DRAFT", "STAGED"] as const) {
        const f = await fixture({ status });
        expect(await f.view()).toBeNull();
        expect((await f.quote()).result.discountTotal).toBe("0.0000");
      }
      const f = await fixture();
      expect(
        await resolvePublicCampaign(f.saved.id, "foreign-market", "USD", "en"),
      ).toBeNull();
      expect(
        await resolvePublicCampaign(f.saved.id, f.market.id, "CAD", "en"),
      ).toBeNull();
    });
    it("discloses coupon/personal eligibility and never promises the discount from status alone", async () => {
      for (const overrides of [
        { couponRequired: true },
        { perCustomerCap: 1 },
        {
          definition: {
            version: 1 as const,
            conditions: [
              { field: "subtotal" as const, op: "gte" as const, value: "500" },
            ],
            selector: {
              productIds: [],
              categoryIds: [],
              collectionIds: [],
              excludedProductIds: [],
              excludedCategoryIds: [],
              excludedCollectionIds: [],
            },
            effect: { type: "fixed" as const, amount: "10" },
            maxDiscount: null,
          },
        },
      ]) {
        const f = await fixture(overrides);
        expect((await f.view())?.conditional).toBe(true);
        expect((await f.quote()).result.discountTotal).toBe("0.0000");
      }
    });
    it("hides exhausted total capacity and budget consistently with the existing engine", async () => {
      for (const overrides of [{ totalUsageCap: 0 }, { budget: "0.0000" }]) {
        const f = await fixture(overrides);
        expect((await f.view())?.state).toBe("EXHAUSTED");
        expect((await f.quote()).result.discountTotal).toBe("0.0000");
      }
    });
  },
);
