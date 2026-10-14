import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const session = vi.hoisted(() => ({ actor: "" }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (session.actor ? { user: { id: session.actor } } : null),
}));
import { db } from "@/lib/db";
import { initialProductVariant } from "@/modules/catalog/selection";
import { NEW_ARRIVAL_TAG } from "@/modules/catalog/merchandising";
import { getVariantDisplayPrices } from "@/modules/pricing";
import { findProductBySlug, listCatalogProducts } from "@/modules/catalog";
import { listingFilters } from "@/modules/catalog/listing-query";
import { saveProduct } from "@/app/admin/(dashboard)/catalog/products/actions";
import { setMaintenanceFlag } from "@/modules/settings";
const id = `r5-${randomUUID()}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R5 selection amount, filtered search and actual admin merchandising save",
  () => {
    let market: Awaited<ReturnType<typeof db.market.findUniqueOrThrow>>;
    let owner = "",
      denied = "",
      categoryId = "",
      variantIds: string[] = [];
    const text = {
      fa: "محصول آزمون R5",
      tr: "R5 deneme ürünü",
      en: "R5 real selection fixture",
    };
    beforeAll(async () => {
      setMaintenanceFlag(false);
      market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      const role = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
      denied = (
        await db.user.create({
          data: {
            email: `${id}@example.com`,
            name: "Scoped synthetic R5 actor",
            passwordHash: "fixture",
            roles: {
              create: { roleId: role.id, scope: { marketId: market.id } },
            },
          },
        })
      ).id;
      const source = await db.product.findUniqueOrThrow({
        where: { id: "seed-style-v2-women-tee" },
        include: { variants: { include: { size: true, stockItems: true } } },
      });
      categoryId = source.categoryId;
      await db.product.create({
        data: {
          id,
          titleI18n: text,
          slugI18n: { fa: id, tr: id, en: id },
          descriptionI18n: text,
          gender: source.gender,
          categoryId,
          status: "ACTIVE",
          searchText: id,
          basePriceAmount: "25",
          basePriceCurrency: "USD",
          marketIds: [market.id],
          tags: ["owner-tag"],
        },
      });
      for (const [n, key, qty, amount] of [
        [0, "seed-style-v2-women-tee-m", 5, "40.5000"],
        [1, "seed-style-v2-women-tee-charcoal-m", 0, "99.0000"],
        [2, "seed-style-v2-women-tee-charcoal-l", 7, "100.2500"],
      ] as const) {
        const original = await db.variant.findUniqueOrThrow({
          where: { id: key },
          include: { stockItems: true },
        });
        const variant = await db.variant.create({
          data: {
            id: `${id}-${n}`,
            sku: `${id}-${n}`.toUpperCase(),
            productId: id,
            colorId: original.colorId,
            sizeId: original.sizeId,
            isActive: true,
          },
        });
        variantIds.push(variant.id);
        await db.stockItem.create({
          data: {
            variantId: variant.id,
            warehouseId: original.stockItems[0].warehouseId,
            onHand: qty,
            reserved: 0,
          },
        });
        await db.marketPrice.create({
          data: {
            variantId: variant.id,
            marketId: market.id,
            amount,
            currency: market.currency,
            validFrom: new Date("2000-01-01T00:00:00Z"),
          },
        });
      }
    });
    afterAll(async () => {
      session.actor = "";
      await db.marketPrice.deleteMany({
        where: { variantId: { in: variantIds } },
      });
      await db.stockItem.deleteMany({
        where: { variantId: { in: variantIds } },
      });
      await db.variant.deleteMany({ where: { id: { in: variantIds } } });
      await db.product.deleteMany({ where: { id } });
      if (denied)
        await db.user.update({
          where: { id: denied },
          data: { isActive: false },
        });
    });
    it("the chosen non-first color/stocked size resolves its own manual Decimal amount", async () => {
      const product = await findProductBySlug(market.id, "en", id);
      expect(product).not.toBeNull();
      const color = product!.variants.find(
        (variant) => variant.id === variantIds[2],
      )!.colorId;
      const selected = initialProductVariant(product!.variants, color)!;
      expect(selected.id).toBe(variantIds[2]);
      const prices = await getVariantDisplayPrices([product!], market);
      expect(prices.get(selected.id)!.amount).toBe("100.25");
      expect(prices.get(variantIds[0])!.amount).toBe("40.5");
      const filters = listingFilters({
        color,
        size: selected.sizeId,
        available: "1",
        sort: "price-asc",
      });
      const result = await listCatalogProducts(market.id, "en", {
        q: id,
        ...filters,
      });
      expect(result.items.some((product) => product.id === id)).toBe(true);
      const foreign = await db.market.findUniqueOrThrow({
        where: { code: "TR" },
      });
      expect(
        (
          await listCatalogProducts(foreign.id, "en", { q: id, ...filters })
        ).items.some((product) => product.id === id),
      ).toBe(false);
    });
    async function form(flag: boolean | undefined) {
      const product = await db.product.findUniqueOrThrow({
        where: { id },
        include: { variants: true },
      });
      const data = new FormData();
      const values = {
        id,
        categoryId,
        gender: product.gender,
        status: "ACTIVE",
        basePriceAmount: "25",
        weightGrams: "250",
        tags: flag === undefined ? `owner-tag,${NEW_ARRIVAL_TAG}` : "owner-tag",
        mediaIds: "[]",
        attributes: "[]",
        variants: JSON.stringify(
          product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            barcode: "",
            colorId: variant.colorId,
            sizeId: variant.sizeId,
            isActive: true,
            priceOverrideUsd: "",
            mediaIds: [],
          })),
        ),
      };
      for (const [key, value] of Object.entries(values)) data.set(key, value);
      for (const [locale, value] of Object.entries(text)) {
        const suffix = locale[0].toUpperCase() + locale.slice(1);
        data.set(`title${suffix}`, value);
        data.set(`description${suffix}`, value);
        data.set(`slug${suffix}`, id);
      }
      data.append("marketIds", market.id);
      if (flag !== undefined) {
        data.set("merchandisingFields", "1");
        if (flag) data.set("newArrival", "on");
      }
      return data;
    }
    it("checkbox save/reload, explicit removal, legacy tags and denied mutation use the real product action/audit", async () => {
      session.actor = owner;
      const before = await db.auditLog.count({ where: { entityId: id } });
      expect(await saveProduct(null, await form(true))).toMatchObject({
        ok: true,
      });
      expect(
        (await db.product.findUniqueOrThrow({ where: { id } })).tags,
      ).toEqual(["owner-tag", NEW_ARRIVAL_TAG]);
      expect(
        await db.auditLog.count({ where: { entityId: id } }),
      ).toBeGreaterThan(before);
      expect(await saveProduct(null, await form(false))).toMatchObject({
        ok: true,
      });
      expect(
        (await db.product.findUniqueOrThrow({ where: { id } })).tags,
      ).toEqual(["owner-tag"]);
      expect(await saveProduct(null, await form(undefined))).toMatchObject({
        ok: true,
      });
      session.actor = denied;
      const deniedBefore = await db.auditLog.count({ where: { entityId: id } });
      expect(await saveProduct(null, await form(false))).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
      expect(
        (await db.product.findUniqueOrThrow({ where: { id } })).tags,
      ).toContain(NEW_ARRIVAL_TAG);
      expect(await db.auditLog.count({ where: { entityId: id } })).toBe(
        deniedBefore,
      );
    });
  },
);
