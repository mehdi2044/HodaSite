import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (actor.id ? { user: { id: actor.id } } : null),
}));
import { db } from "@/lib/db";
import { setMaintenanceFlag } from "@/modules/settings";
import {
  savePromotionProgram,
  listPromotionPrograms,
  issuePromotionCoupons,
  setPromotionCouponStatus,
} from "@/modules/promotions/persistence";
import {
  promotionEditorData,
  listPromotionCoupons,
  promotionHistory,
  promotionSampleCarts,
} from "@/modules/promotions/admin-read";
import {
  saveProgramAction,
  issueCouponsAction,
  couponStatusAction,
  simulateAction,
} from "@/app/admin/(dashboard)/promotions/actions";
import { simulatePromotionCart } from "@/modules/promotions/simulator";
import {
  redeemOrderPromotions,
  releaseCancelledOrderPromotions,
} from "@/modules/promotions/redemption";
import { evaluateStoredPromotions } from "@/modules/promotions/evidence";
import {
  promotionRevisionSchema,
  type PromotionRevision,
} from "@/modules/promotions";

let owner = "",
  denied = "",
  scoped = "",
  inactive = "",
  marketId = "",
  otherMarket = "",
  customerId = "",
  secondCustomer = "",
  foreignCustomer = "",
  variantId = "",
  productId = "",
  categoryId = "";
const startsAt = "2020-01-01T00:00:00Z";
function input(overrides: Partial<PromotionRevision> = {}, market = marketId) {
  const config = {
    enabled: true,
    status: "ACTIVE" as const,
    startsAt,
    endsAt: null,
    priority: 0,
    group: "all",
    stacking: "STACKABLE" as const,
    excludes: [],
    couponRequired: true,
    totalUsageCap: null,
    perCustomerCap: null,
    budget: null,
    definition: {
      version: 1 as const,
      conditions: [],
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
    ...overrides,
  };
  return {
    marketId: market,
    expectedVersion: 0,
    mutationKey: randomUUID(),
    confirmed: true as const,
    name: "Test program",
    description: "Test",
    category: "test",
    ownerNotes: "Internal fixture",
    titleI18n: { en: "Benefit", fa: "تخفیف", tr: "İndirim" },
    descriptionI18n: { en: "", fa: "", tr: "" },
    config,
  };
}
async function program(overrides: Partial<PromotionRevision> = {}) {
  const raw = input(overrides),
    saved = await savePromotionProgram(raw);
  return { raw, ...saved };
}
async function coupon(
  programId: string,
  limits: {
    totalUsageCap?: number | null;
    perCustomerCap?: number | null;
  } = {},
) {
  const raw = {
    programId,
    marketId,
    mutationKey: randomUUID(),
    confirmed: true,
    codes: [randomUUID().toUpperCase()],
    generateCount: 0,
    startsAt,
    endsAt: null,
    totalUsageCap: null,
    perCustomerCap: null,
    ...limits,
  };
  const [row] = await issuePromotionCoupons(raw);
  return { raw, ...row };
}
async function order(ownerId = customerId, discount = "10", market = marketId) {
  const cart = await db.cart.create({
    data: {
      tokenHash: randomUUID(),
      customerId: ownerId,
      marketId: market,
      locale: "en",
      currency: "USD",
      expiresAt: new Date("2099-01-01"),
    },
  });
  return db.order.create({
    data: {
      number: randomUUID(),
      cartId: cart.id,
      customerId: ownerId,
      marketId: market,
      guestTokenHash: "test",
      locale: "en",
      currency: "USD",
      subtotalAmount: "100",
      feeTotalAmount: "0",
      discountAmount: discount,
      totalAmount: new Prisma.Decimal(100).sub(discount),
      totalAmountUsd: new Prisma.Decimal(100).sub(discount),
      totalAmountTry: new Prisma.Decimal(100).sub(discount),
      fxSnapshot: {},
      bankSnapshot: {},
      contactSnapshot: {},
      shippingAddress: {},
      billingAddress: {},
      holdExpiresAt: new Date("2099-01-01"),
      paymentDeadlineAt: new Date("2099-01-01"),
      items: {
        create: {
          variantId,
          productSnapshot: {},
          unitPriceAmount: "100",
          quantity: 1,
          lineTotalAmount: "100",
          currency: "USD",
          weightGrams: 100,
        },
      },
    },
  });
}
const redeem = (
  id: string,
  codes: string[],
  customer: string | null = customerId,
) =>
  db.$transaction((tx) => redeemOrderPromotions(tx, id, customer, codes), {
    isolationLevel: "ReadCommitted",
    timeout: 15000,
  });
const release = (id: string) =>
  db.$transaction((tx) => releaseCancelledOrderPromotions(tx, id), {
    isolationLevel: "ReadCommitted",
  });

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "09B PostgreSQL persistence, identity and atomic caps",
  () => {
    beforeAll(async () => {
      setMaintenanceFlag(false);
      const suffix = randomUUID().slice(0, 8);
      for (const which of ["a", "b"]) {
        const m = await db.market.create({
          data: {
            code: `PROMO${which}${suffix}`,
            name: "Test",
            currency: "USD",
            defaultLocale: "en",
            enabledLocales: ["en", "fa", "tr"],
            roundingRule: { mode: "NEAREST", increment: "0.01" },
            holdHours: 1,
            paymentDeadlineHours: 24,
            fxMode: "AUTO_ACCEPT",
          },
        });
        if (which === "a") marketId = m.id;
        else otherMarket = m.id;
      }
      for (const kind of ["owner", "denied", "scoped", "inactive"]) {
        const u = await db.user.create({
          data: {
            email: `promotion-${kind}-${suffix}@example.com`,
            name: "Test",
            passwordHash: "unused",
            isActive: kind !== "inactive",
          },
        });
        if (kind === "owner") {
          owner = u.id;
          await db.userRole.create({
            data: {
              userId: owner,
              roleId: (
                await db.role.findUniqueOrThrow({ where: { key: "owner" } })
              ).id,
            },
          });
        } else if (kind === "denied") denied = u.id;
        else {
          if (kind === "scoped") scoped = u.id;
          else inactive = u.id;
          await db.userPermissionOverride.create({
            data: {
              userId: u.id,
              permission: "pricing.sale_price.edit",
              allow: true,
              scope: { marketId },
            },
          });
        }
      }
      for (const i of [0, 1, 2]) {
        const c = await db.customer.create({
          data: {
            email: `promotion-c${i}-${suffix}@example.com`,
            isGuest: false,
            preferredMarketId: i === 2 ? otherMarket : marketId,
          },
        });
        if (i === 0) customerId = c.id;
        else if (i === 1) secondCustomer = c.id;
        else foreignCustomer = c.id;
      }
      const v = await db.variant.findFirstOrThrow({
        include: { product: true },
      });
      variantId = v.id;
      productId = v.productId;
      categoryId = v.product.categoryId;
    });
    beforeEach(() => {
      actor.id = owner;
      setMaintenanceFlag(false);
    });

    it.each(["denied", "inactive", "anonymous", "wrong-market"])(
      "guards admin actions and loaders for %s",
      async (kind) => {
        actor.id =
          kind === "denied"
            ? denied
            : kind === "inactive"
              ? inactive
              : kind === "anonymous"
                ? ""
                : scoped;
        const market = kind === "wrong-market" ? otherMarket : marketId;
        const before = await db.auditLog.count();
        await expect(promotionEditorData(market)).rejects.toThrow();
        await expect(listPromotionCoupons(market, "missing")).rejects.toThrow();
        await expect(promotionHistory(market, "missing")).rejects.toThrow();
        await expect(promotionSampleCarts(market)).rejects.toThrow();
        expect(await saveProgramAction(input({}, market))).toMatchObject({
          ok: false,
          code: "FORBIDDEN",
        });
        expect(
          await issueCouponsAction({
            marketId: market,
            programId: "missing",
            mutationKey: randomUUID(),
            confirmed: true,
            codes: ["TESTCODE"],
            generateCount: 0,
            startsAt,
            endsAt: null,
            totalUsageCap: null,
            perCustomerCap: null,
          }),
        ).toMatchObject({ ok: false, code: "FORBIDDEN" });
        expect(
          await couponStatusAction({
            marketId: market,
            id: "missing",
            expectedVersion: 1,
            status: "PAUSED",
            confirmed: true,
          }),
        ).toMatchObject({ ok: false, code: "FORBIDDEN" });
        expect(
          await simulateAction({
            marketId: market,
            cartId: "missing",
            couponCodes: [],
          }),
        ).toMatchObject({ ok: false, code: "FORBIDDEN" });
        expect(await db.auditLog.count()).toBe(before);
      },
    );
    it("does not let pricing-only users list customer carts or simulate", async () => {
      actor.id = scoped;
      expect((await promotionEditorData(marketId)).segmentAllowed).toBe(false);
      await expect(promotionSampleCarts(marketId)).rejects.toThrow();
      expect(
        await simulateAction({ marketId, cartId: "missing", couponCodes: [] }),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });
    it("reads only same-market editor, history and coupon data", async () => {
      const p = await program();
      const c = await coupon(p.id);
      expect((await promotionEditorData(marketId, p.id)).saved?.version).toBe(
        1,
      );
      const history = await promotionHistory(marketId, p.id);
      expect(history).toHaveLength(1);
      expect(history[0]).not.toHaveProperty("actorId");
      const coupons = await listPromotionCoupons(marketId, p.id);
      expect(coupons[0].id).toBe(c.id);
      expect(coupons[0]).not.toHaveProperty("mutationHash");
      await expect(promotionEditorData(otherMarket, p.id)).rejects.toThrow(
        "NOT_FOUND",
      );
      await expect(listPromotionCoupons(otherMarket, p.id)).rejects.toThrow(
        "NOT_FOUND",
      );
      expect(await promotionHistory(otherMarket, p.id)).toHaveLength(0);
    });
    it("scopes product options and all submitted product references to the authorized market", async () => {
      const makeProduct = (markets: string[], deletedAt: Date | null = null) =>
        db.product.create({
          data: {
            slugI18n: { en: randomUUID() },
            titleI18n: { en: "Market selector fixture" },
            descriptionI18n: {},
            categoryId,
            gender: "UNISEX",
            status: "ACTIVE",
            basePriceAmount: "100",
            marketIds: markets,
            deletedAt,
          },
        });
      const local = await makeProduct([marketId]),
        shared = await makeProduct([marketId, otherMarket]),
        foreign = await makeProduct([otherMarket]),
        deleted = await makeProduct([marketId], new Date());
      actor.id = scoped;
      const options = (await promotionEditorData(marketId)).products.map(
        (p) => p.id,
      );
      expect(options).toEqual(expect.arrayContaining([local.id, shared.id]));
      expect(options).not.toContain(foreign.id);
      expect(options).not.toContain(deleted.id);
      const base = input(),
        raw = {
          ...base,
          config: {
            ...base.config,
            definition: {
              ...base.config.definition,
              selector: {
                ...base.config.definition.selector,
                productIds: [local.id, shared.id],
              },
            },
          },
        };
      const saved = await savePromotionProgram(raw);
      const programsBefore = await db.promotionProgram.count();
      const auditsBefore = await db.auditLog.count();
      for (const field of ["condition", "include", "exclude"]) {
        for (const ref of [foreign.id, deleted.id, "missing-product"]) {
          const definition: PromotionRevision["definition"] = {
            ...raw.config.definition,
            conditions:
              field === "condition" ? [{ field: "product", value: ref }] : [],
            selector: {
              ...raw.config.definition.selector,
              productIds: field === "include" ? [ref] : [local.id],
              excludedProductIds: field === "exclude" ? [ref] : [],
            },
          };
          const rejected = {
            ...raw,
            mutationKey: randomUUID(),
            config: { ...raw.config, definition },
          };
          expect(await saveProgramAction(rejected)).toMatchObject({
            ok: false,
            code: "INVALID_REFERENCE",
          });
          expect(
            await saveProgramAction({
              ...rejected,
              id: saved.id,
              expectedVersion: 1,
              mutationKey: randomUUID(),
            }),
          ).toMatchObject({ ok: false, code: "INVALID_REFERENCE" });
        }
      }
      expect(await db.promotionProgram.count()).toBe(programsBefore);
      expect(await db.auditLog.count()).toBe(auditsBefore);
      expect(await promotionHistory(marketId, saved.id)).toHaveLength(1);
      expect(
        (await promotionEditorData(marketId, saved.id)).saved?.version,
      ).toBe(1);
      // Deduplicate references across condition/include/exclude before validation.
      const valid = {
        ...raw,
        id: saved.id,
        expectedVersion: 1,
        mutationKey: randomUUID(),
        config: {
          ...raw.config,
          definition: {
            ...raw.config.definition,
            conditions: [{ field: "product" as const, value: local.id }],
            selector: {
              ...raw.config.definition.selector,
              excludedProductIds: [shared.id],
            },
          },
        },
      };
      expect((await savePromotionProgram(valid)).version).toBe(2);
      expect((await savePromotionProgram(valid)).version).toBe(2);
    });
    it("server actions preserve retry identity, reject stale edits and require confirmation", async () => {
      const raw = input({ status: "DRAFT", enabled: false });
      const first = await saveProgramAction(raw);
      expect(first.ok).toBe(true);
      expect(await saveProgramAction(raw)).toEqual(first);
      expect(
        await saveProgramAction({ ...raw, confirmed: false }),
      ).toMatchObject({ ok: false, code: "VALIDATION" });
      if (!first.ok) throw new Error("fixture save failed");
      const edit = {
        ...raw,
        id: first.data.id,
        expectedVersion: 1,
        mutationKey: randomUUID(),
        name: "Changed",
      };
      expect((await saveProgramAction(edit)).ok).toBe(true);
      expect(
        await saveProgramAction({ ...edit, mutationKey: randomUUID() }),
      ).toMatchObject({ ok: false, code: "STALE_VERSION" });
    });

    it.each(["denied", "inactive", "anonymous", "wrong-market"])(
      "denies %s admin reads and writes without an audit side effect",
      async (kind) => {
        actor.id =
          kind === "denied"
            ? denied
            : kind === "inactive"
              ? inactive
              : kind === "anonymous"
                ? ""
                : scoped;
        const market = kind === "wrong-market" ? otherMarket : marketId;
        const before = await db.promotionProgram.count();
        await expect(savePromotionProgram(input({}, market))).rejects.toThrow();
        await expect(listPromotionPrograms(market)).rejects.toThrow();
        expect(await db.promotionProgram.count()).toBe(before);
      },
    );
    it("requires confirmation and honors maintenance", async () => {
      await expect(
        savePromotionProgram({ ...input(), confirmed: false }),
      ).rejects.toThrow();
      setMaintenanceFlag(true);
      await expect(savePromotionProgram(input())).rejects.toThrow(
        "MAINTENANCE",
      );
      setMaintenanceFlag(false);
    });
    it("serializes simultaneous create retries, appends immutable revisions, rejects stale edits", async () => {
      const raw = input();
      const [a, b] = await Promise.all([
        savePromotionProgram(raw),
        savePromotionProgram(raw),
      ]);
      expect(a).toEqual(b);
      expect(
        await db.promotionProgramRevision.count({ where: { programId: a.id } }),
      ).toBe(1);
      expect(
        await db.auditLog.count({
          where: { entityId: a.id, action: "promotion.program.save" },
        }),
      ).toBe(1);
      await expect(
        savePromotionProgram({ ...raw, name: "changed" }),
      ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
      const update = {
        ...raw,
        id: a.id,
        expectedVersion: 1,
        mutationKey: randomUUID(),
        name: "second",
      };
      expect((await savePromotionProgram(update)).version).toBe(2);
      await expect(
        savePromotionProgram({ ...update, mutationKey: randomUUID() }),
      ).rejects.toThrow("STALE_VERSION");
      await expect(
        db.promotionProgramRevision.updateMany({
          where: { programId: a.id },
          data: { name: "rewrite" },
        }),
      ).rejects.toThrow("append-only");
      await expect(
        db.promotionProgram.update({
          where: { id: a.id },
          data: { marketId: otherMarket, version: 3 },
        }),
      ).rejects.toThrow();
    });
    it("rejects cross-market IDs, segment references and foreign coupon updates", async () => {
      const p = await program();
      await expect(
        savePromotionProgram({
          ...p.raw,
          id: p.id,
          expectedVersion: 1,
          marketId: otherMarket,
          mutationKey: randomUUID(),
        }),
      ).rejects.toThrow("NOT_FOUND");
      const segment = await db.crmSegment.create({
        data: {
          marketId: otherMarket,
          name: "foreign",
          definition: { version: 1, rules: [] },
        },
      });
      const raw = input();
      await expect(
        savePromotionProgram({
          ...raw,
          config: {
            ...raw.config,
            definition: {
              ...raw.config.definition,
              conditions: [{ field: "segment", value: segment.id }],
            },
          },
        }),
      ).rejects.toThrow("INVALID_REFERENCE");
      const c = await coupon(p.id);
      await expect(
        setPromotionCouponStatus({
          id: c.id,
          marketId: otherMarket,
          expectedVersion: 1,
          status: "PAUSED",
          confirmed: true,
        }),
      ).rejects.toThrow("NOT_FOUND");
    });
    it("issues bounded bulk codes once and preserves immutable terms", async () => {
      const p = await program(),
        c = await coupon(p.id);
      const raw = {
        ...c.raw,
        codes: [],
        generateCount: 3,
        mutationKey: randomUUID(),
      };
      const [a, b] = await Promise.all([
        issuePromotionCoupons(raw),
        issuePromotionCoupons(raw),
      ]);
      expect(a).toEqual(b);
      expect(new Set(a.map((x) => x.code)).size).toBe(3);
      await expect(
        db.promotionCoupon.update({
          where: { id: c.id },
          data: { code: "CHANGED", version: 2 },
        }),
      ).rejects.toThrow();
      await setPromotionCouponStatus({
        id: c.id,
        marketId,
        expectedVersion: 1,
        status: "PAUSED",
        confirmed: true,
      });
      await expect(
        setPromotionCouponStatus({
          id: c.id,
          marketId,
          expectedVersion: 1,
          status: "ACTIVE",
          confirmed: true,
        }),
      ).rejects.toThrow("STALE_VERSION");
      await setPromotionCouponStatus({
        id: c.id,
        marketId,
        expectedVersion: 2,
        status: "ARCHIVED",
        confirmed: true,
      });
      // Lifecycle requests are version-checked, not keyed replays: recover by
      // reading current state, never by silently applying against a new version.
      await expect(
        setPromotionCouponStatus({
          id: c.id,
          marketId,
          expectedVersion: 2,
          status: "ARCHIVED",
          confirmed: true,
        }),
      ).rejects.toThrow("STALE_VERSION");
      expect(
        await db.promotionCoupon.findUniqueOrThrow({ where: { id: c.id } }),
      ).toMatchObject({ status: "ARCHIVED", version: 3 });
      expect(
        await db.auditLog.count({
          where: {
            entityType: "PromotionCoupon",
            entityId: c.id,
            action: "promotion.coupon.status",
          },
        }),
      ).toBe(2);
      await expect(
        setPromotionCouponStatus({
          id: c.id,
          marketId,
          expectedVersion: 3,
          status: "ACTIVE",
          confirmed: true,
        }),
      ).rejects.toThrow("ARCHIVED");
    });
    it.each([
      "program-total",
      "program-customer",
      "budget",
      "coupon-total",
      "coupon-customer",
    ])("two concurrent orders cannot exceed %s", async (kind) => {
      const p = await program(
        kind === "program-total"
          ? { totalUsageCap: 1 }
          : kind === "program-customer"
            ? { perCustomerCap: 1 }
            : kind === "budget"
              ? { budget: "10" }
              : {},
      );
      const c = await coupon(
        p.id,
        kind === "coupon-total"
          ? { totalUsageCap: 1 }
          : kind === "coupon-customer"
            ? { perCustomerCap: 1 }
            : {},
      );
      const [a, b] = await Promise.all([order(), order()]);
      const result = await Promise.allSettled([
        redeem(a.id, [c.code]),
        redeem(b.id, [c.code]),
      ]);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(1);
      expect(
        await db.promotionOrderEvaluation.count({
          where: { orderId: { in: [a.id, b.id] } },
        }),
      ).toBe(1);
    });
    it("retry after success returns immutable snapshot; changed identity/input fails", async () => {
      const p = await program(),
        c = await coupon(p.id),
        o = await order();
      const result = await redeem(o.id, [c.code]);
      await setPromotionCouponStatus({
        id: c.id,
        marketId,
        expectedVersion: 1,
        status: "PAUSED",
        confirmed: true,
      });
      expect(await redeem(o.id, [c.code.toLowerCase()])).toEqual(result);
      await expect(redeem(o.id, [], customerId)).rejects.toThrow(
        "IDEMPOTENCY_CONFLICT",
      );
      await expect(redeem(o.id, [c.code], secondCustomer)).rejects.toThrow(
        "ORDER_MISMATCH",
      );
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(1);
      await expect(
        db.promotionRedemption.updateMany({
          where: { programId: p.id },
          data: { amount: "11" },
        }),
      ).rejects.toThrow("append-only");
    });
    it("rollback after redemption preserves availability and all-or-nothing evidence", async () => {
      const p = await program({ totalUsageCap: 1 }),
        c = await coupon(p.id),
        o = await order();
      await expect(
        db.$transaction(async (tx) => {
          await redeemOrderPromotions(tx, o.id, customerId, [c.code]);
          throw new Error("rollback fixture");
        }),
      ).rejects.toThrow("rollback fixture");
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(0);
      await redeem(o.id, [c.code]);
    });
    it("a revision edit does not reset lifetime usage or budget", async () => {
      const p = await program({ totalUsageCap: 1 }),
        c = await coupon(p.id),
        o = await order();
      await redeem(o.id, [c.code]);
      await savePromotionProgram({
        ...p.raw,
        id: p.id,
        expectedVersion: 1,
        mutationKey: randomUUID(),
        name: "New version",
      });
      await expect(redeem((await order()).id, [c.code])).rejects.toThrow(
        "ORDER_MISMATCH",
      );
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(1);
    });
    it("per-customer caps separate verified customers; guest emails never bypass identity", async () => {
      const p = await program({ perCustomerCap: 1 }),
        c = await coupon(p.id);
      await redeem((await order()).id, [c.code]);
      await redeem((await order(secondCustomer)).id, [c.code], secondCustomer);
      await expect(redeem((await order()).id, [c.code], null)).rejects.toThrow(
        "ORDER_MISMATCH",
      );
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(2);
    });
    it("unpaid cancellation releases once and retains immutable financial evidence", async () => {
      const p = await program({ totalUsageCap: 1 }),
        c = await coupon(p.id),
        o = await order();
      await redeem(o.id, [c.code]);
      await expect(release(o.id)).rejects.toThrow("RELEASE_FORBIDDEN");
      await db.order.update({
        where: { id: o.id },
        data: { status: "CANCELLED" },
      });
      await Promise.all([release(o.id), release(o.id)]);
      const e = await db.promotionOrderEvaluation.findUniqueOrThrow({
        where: { orderId: o.id },
      });
      expect(
        await db.promotionUsageRelease.count({ where: { evaluationId: e.id } }),
      ).toBe(1);
      await redeem((await order()).id, [c.code]);
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(2);
      expect(
        (
          await db.order.findUniqueOrThrow({ where: { id: o.id } })
        ).discountAmount.toFixed(4),
      ).toBe("10.0000");
      await expect(
        db.promotionUsageRelease.deleteMany({ where: { evaluationId: e.id } }),
      ).rejects.toThrow("append-only");
    });
    it.each(["paidAt", "approved-payment"])(
      "never releases %s even if cancelled",
      async (proof) => {
        const p = await program(),
          c = await coupon(p.id),
          o = await order();
        await redeem(o.id, [c.code]);
        await db.order.update({
          where: { id: o.id },
          data: {
            status: "CANCELLED",
            ...(proof === "paidAt" ? { paidAt: new Date() } : {}),
          },
        });
        if (proof === "approved-payment")
          await db.payment.create({
            data: {
              orderId: o.id,
              amount: "90",
              currency: "USD",
              status: "APPROVED",
            },
          });
        await expect(release(o.id)).rejects.toThrow("RELEASE_FORBIDDEN");
        const e = await db.promotionOrderEvaluation.findUniqueOrThrow({
          where: { orderId: o.id },
        });
        await expect(
          db.promotionUsageRelease.create({
            data: { evaluationId: e.id, reason: "CANCELLED_UNPAID" },
          }),
        ).rejects.toThrow();
      },
    );
    it("zero-benefit evidence is also idempotent and cannot acquire discounts later", async () => {
      const o = await order(customerId, "0");
      const result = await redeem(o.id, []);
      expect(result).toMatchObject({ discountTotal: "0.0000" });
      expect(await redeem(o.id, [])).toEqual(result);
      await expect(
        db.promotionOrderEvaluation.deleteMany({ where: { orderId: o.id } }),
      ).rejects.toThrow("append-only");
    });
    it("market, currency, paused/expired coupons and unknown codes fail closed", async () => {
      const p = await program(),
        c = await coupon(p.id);
      await expect(
        redeem((await order(customerId, "10", otherMarket)).id, [c.code], null),
      ).rejects.toThrow("ORDER_MISMATCH");
      const o = await order();
      await expect(redeem(o.id, ["UNKNOWN-CODE"])).rejects.toThrow(
        "ORDER_MISMATCH",
      );
      await setPromotionCouponStatus({
        id: c.id,
        marketId,
        expectedVersion: 1,
        status: "PAUSED",
        confirmed: true,
      });
      await expect(redeem(o.id, [c.code])).rejects.toThrow("ORDER_MISMATCH");
      const expired = await issuePromotionCoupons({
        ...c.raw,
        mutationKey: randomUUID(),
        codes: [randomUUID()],
        endsAt: "2020-02-01T00:00:00Z",
      });
      await expect(redeem(o.id, [expired[0].code])).rejects.toThrow(
        "ORDER_MISMATCH",
      );
      await expect(
        db.$transaction(
          (tx) => redeemOrderPromotions(tx, o.id, customerId, [c.code]),
          { isolationLevel: "RepeatableRead" },
        ),
      ).rejects.toThrow("ORDER_MISMATCH");
    });
    it("reuses market-scoped CRM segment SQL, tags and normalized consent without writes", async () => {
      const s = await db.crmSegment.create({
        data: {
          marketId,
          name: "Test segment",
          definition: {
            version: 1,
            rules: [{ field: "tag", value: "promotion-test" }],
          },
        },
      });
      await db.crmProfile.upsert({
        where: { customerId_marketId: { customerId, marketId } },
        create: { customerId, marketId, tags: ["promotion-test"] },
        update: { tags: ["promotion-test"] },
      });
      await db.marketingConsent.create({
        data: {
          customerId,
          marketId,
          channel: "email",
          status: "OPTED_IN",
          source: "test",
        },
      });
      const raw = input(),
        p = await savePromotionProgram({
          ...raw,
          config: {
            ...raw.config,
            definition: {
              ...raw.config.definition,
              conditions: [
                { field: "segment", value: s.id },
                { field: "tag", value: "promotion-test" },
                { field: "consent", channel: "email", value: "OPTED_IN" },
              ],
            },
          },
        }),
        c = await coupon(p.id);
      const cart = {
        marketId,
        currency: "USD" as const,
        locale: "en" as const,
        items: [
          {
            variantId,
            productId,
            categoryId,
            collectionIds: [],
            quantity: 1,
            unitPrice: "100",
          },
        ],
        shippingAmount: "0",
      };
      const before = await db.promotionOrderEvaluation.count();
      const evaluate = (id: string) =>
        db.$transaction(
          async (tx) =>
            (await evaluateStoredPromotions(tx, cart, id, [c.code], false))
              .result,
          { isolationLevel: "RepeatableRead" },
        );
      expect((await evaluate(customerId)).discountTotal).toBe("10.0000");
      expect((await evaluate(secondCustomer)).discountTotal).toBe("0.0000");
      await expect(evaluate(foreignCustomer)).rejects.toThrow();
      expect(await db.promotionOrderEvaluation.count()).toBe(before);
    });
    it("simulator requires customer and segment read privileges beyond price editing", async () => {
      actor.id = scoped;
      await expect(
        simulatePromotionCart({ marketId, cartId: "missing", couponCodes: [] }),
      ).rejects.toThrow();
    });
    it("simulates saved drafts and shipping in every locale without side effects", async () => {
      const p = await program({ status: "DRAFT" }),
        c = await coupon(p.id);
      const shippingProgram = await program({
        status: "DRAFT",
        definition: {
          ...p.raw.config.definition,
          effect: { type: "freeShipping" },
        },
      });
      const shippingCoupon = await coupon(shippingProgram.id);
      const fee = {
        marketId,
        labelI18n: { en: "Shipping fixture" },
        type: "SHIPPING" as const,
        method: "FIXED" as const,
        currency: "USD",
        selectable: true,
        validFrom: new Date(0),
      };
      await db.feeRule.create({
        data: { ...fee, priority: 1, params: { amount: "5" } },
      });
      await db.feeRule.create({
        data: {
          ...fee,
          province: "ON",
          city: "Toronto",
          postalPrefix: "M5V",
          params: { amount: "25" },
        },
      });
      const express = await db.feeRule.create({
        data: { ...fee, params: { amount: "35" } },
      });
      const foreign = await db.feeRule.create({
        data: { ...fee, marketId: otherMarket, params: { amount: "99" } },
      });
      const source = await db.variant.findUniqueOrThrow({
        where: { id: variantId },
      });
      const product = await db.product.create({
        data: {
          slugI18n: { en: randomUUID() },
          titleI18n: { en: "Simulation fixture" },
          descriptionI18n: {},
          categoryId,
          gender: "UNISEX",
          status: "ACTIVE",
          basePriceAmount: "100",
          marketIds: [marketId],
          variants: {
            create: {
              sku: randomUUID(),
              colorId: source.colorId,
              sizeId: source.sizeId,
            },
          },
        },
        include: { variants: true },
      });
      await db.stockItem.create({
        data: {
          variantId: product.variants[0].id,
          warehouseId: (await db.warehouse.findFirstOrThrow()).id,
          onHand: 10,
        },
      });
      await db.fxQuote.create({
        data: {
          marketId,
          quoteCurrency: "USD",
          rate: "1",
          provider: "manual",
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
      });
      const cart = await db.cart.create({
        data: {
          tokenHash: randomUUID(),
          customerId,
          marketId,
          locale: "en",
          currency: "USD",
          expiresAt: new Date("2099-01-01"),
          items: { create: { variantId: product.variants[0].id, quantity: 1 } },
        },
      });
      for (const locale of ["en", "fa", "tr"]) {
        await db.cart.update({ where: { id: cart.id }, data: { locale } });
        const raw = { marketId, cartId: cart.id, couponCodes: [c.code] };
        expect((await simulatePromotionCart(raw)).result.discountTotal).toBe(
          "0.0000",
        );
        const preview = await simulatePromotionCart({
          ...raw,
          previewProgramId: p.id,
        });
        expect(preview.estimateOnly).toBe(true);
        expect(preview.result.discountTotal).toBe("10.0000");
        expect(
          preview.result.explanations.find((e) => e.promotionId === p.id)
            ?.reason,
        ).toBe("APPLIED");
        const address = {
          province: " ON ",
          city: "Toronto",
          postalCode: "M5V 1A1",
          email: "shipping-fixture@example.com",
          line1: "Private shipping fixture",
        };
        const cases: [Prisma.InputJsonObject, string][] = [
          [{}, "5.0000"],
          [address, "25.0000"],
          [{ ...address, shippingRuleId: express.id }, "35.0000"],
        ];
        const shippingInput = {
          ...raw,
          couponCodes: [shippingCoupon.code],
          previewProgramId: shippingProgram.id,
        };
        for (const [checkout, amount] of cases) {
          const savedCart = await db.cart.update({
            where: { id: cart.id },
            data: { checkout },
          });
          const audits = await db.auditLog.count();
          const evaluations = await db.promotionOrderEvaluation.count();
          const result = await simulatePromotionCart(shippingInput);
          expect(result.result.shippingDiscount).toBe(amount);
          expect(result.result.discountTotal).toBe(amount);
          expect(JSON.stringify(result)).not.toContain(address.email);
          expect(JSON.stringify(result)).not.toContain(address.line1);
          expect(JSON.stringify(result)).not.toContain(address.postalCode);
          expect(
            await db.cart.findUniqueOrThrow({ where: { id: cart.id } }),
          ).toEqual(savedCart);
          expect(await db.auditLog.count()).toBe(audits);
          expect(await db.promotionOrderEvaluation.count()).toBe(evaluations);
        }
        await db.cart.update({
          where: { id: cart.id },
          data: { checkout: { ...address, shippingRuleId: foreign.id } },
        });
        await expect(simulatePromotionCart(shippingInput)).rejects.toThrow(
          "Invalid shipping selection",
        );
        await db.cart.update({
          where: { id: cart.id },
          data: { checkout: {} },
        });
      }
      expect(
        await db.promotionRedemption.count({
          where: { programId: shippingProgram.id },
        }),
      ).toBe(0);
      expect(
        await db.promotionProgramRevision.count({
          where: { programId: shippingProgram.id },
        }),
      ).toBe(1);
      expect(
        (
          await db.promotionProgramRevision.findFirstOrThrow({
            where: { programId: shippingProgram.id },
          })
        ).config,
      ).toMatchObject({ status: "DRAFT" });
      expect(
        await db.promotionRedemption.count({ where: { programId: p.id } }),
      ).toBe(0);
      expect(
        await db.promotionProgramRevision.count({ where: { programId: p.id } }),
      ).toBe(1);
      expect(
        (
          await db.promotionProgramRevision.findFirstOrThrow({
            where: { programId: p.id },
          })
        ).config,
      ).toMatchObject({ status: "DRAFT" });
    });
    it("rolls back an entire coupon batch when one normalized code already exists", async () => {
      const p = await program(),
        c = await coupon(p.id),
        mutationKey = randomUUID();
      await expect(
        issuePromotionCoupons({
          ...c.raw,
          mutationKey,
          codes: ["AAAA-" + randomUUID(), c.code.toLowerCase()],
        }),
      ).rejects.toThrow();
      expect(await db.promotionCoupon.count({ where: { mutationKey } })).toBe(
        0,
      );
    });
    it("refuses a monetary mismatch without changing the order or writing evidence", async () => {
      const p = await program(),
        c = await coupon(p.id),
        o = await order(customerId, "9.9999");
      await expect(redeem(o.id, [c.code])).rejects.toThrow("ORDER_MISMATCH");
      expect(
        await db.promotionOrderEvaluation.count({ where: { orderId: o.id } }),
      ).toBe(0);
      expect(
        (
          await db.order.findUniqueOrThrow({ where: { id: o.id } })
        ).totalAmount.toFixed(4),
      ).toBe("90.0001");
    });
    it("archive is terminal and all program revisions retain the rule contract", async () => {
      const p = await program();
      await savePromotionProgram({
        ...p.raw,
        id: p.id,
        expectedVersion: 1,
        mutationKey: randomUUID(),
        config: { ...p.raw.config, status: "ARCHIVED" },
      });
      await expect(
        savePromotionProgram({
          ...p.raw,
          id: p.id,
          expectedVersion: 2,
          mutationKey: randomUUID(),
        }),
      ).rejects.toThrow("ARCHIVED");
      await expect(coupon(p.id)).rejects.toThrow("ARCHIVED");
      const revisions = await db.promotionProgramRevision.findMany({
        where: { programId: p.id },
      });
      expect(
        revisions.every(
          (r) => promotionRevisionSchema.safeParse(r.config).success,
        ),
      ).toBe(true);
    });
  },
);
