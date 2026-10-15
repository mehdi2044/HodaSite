import { saveFittingSettings } from "@/modules/fitting/settings";
import { configSchema } from "@/modules/fitting/contracts";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
const state = vi.hoisted(() => ({
  customer: "",
  admin: "",
  token: "",
  market: {} as { id: string; currency: string },
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (state.admin ? { user: { id: state.admin } } : null),
}));
vi.mock("@/modules/customers", async () => {
  const { db } = await import("@/lib/db");
  return {
    currentCustomer: async () =>
      state.customer
        ? db.customer.findUnique({ where: { id: state.customer } })
        : null,
  };
});
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: state.market }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.token }), set: vi.fn() }),
}));
vi.mock("next/cache", () => ({
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/secure-tokens";
import { setMaintenanceFlag } from "@/modules/settings";
import {
  resolveInstantSelection,
  saveInstantLook,
  mutateInstantLook,
  instantLooks,
  addInstantItems,
  instantCatalog,
} from "@/modules/fitting/instant";
import { exportPersonalData } from "@/modules/crm/preferences";
const prefix = `r7a-${randomUUID()}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R7a actual free composition, private wardrobe and atomic cart",
  () => {
    let first = "",
      second = "",
      guest = "",
      cartId = "";
    let ids: string[] = [];
    let integration: Awaited<
      ReturnType<typeof db.integration.findUniqueOrThrow>
    >;
    const input = () => ({ modelId: "woman", variantIds: ids });
    async function save(
      name = "Actual private look",
      extra: Record<string, unknown> = {},
    ) {
      const resolved = await resolveInstantSelection(state.market.id, input());
      return saveInstantLook("en", {
        ...input(),
        name,
        requestKey: randomUUID(),
        fingerprint: resolved.fingerprint,
        ...extra,
      });
    }
    beforeAll(async () => {
      setMaintenanceFlag(false);
      state.market = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      integration = await db.integration.findUniqueOrThrow({
        where: { key: "fitting-room" },
      });
      await db.integration.update({
        where: { id: integration.id },
        data: {
          isActive: false,
          config: {
            ...(integration.config as Prisma.JsonObject),
            enabled: false,
            instantEnabled: true,
          },
        },
      });
      for (const key of ["first", "second", "guest"]) {
        const c = await db.customer.create({
          data: {
            email: `${prefix}-${key}@example.com`,
            isGuest: key === "guest",
          },
        });
        if (key === "first") first = c.id;
        else if (key === "second") second = c.id;
        else guest = c.id;
      }
      state.customer = first;
      state.admin = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      for (const key of ["women-tee", "women-trousers"]) {
        const cutout = await db.catalogCutout.findFirstOrThrow({
          where: { productId: `seed-moda4-style-${key}`, deletedAt: null },
        });
        ids.push(
          (
            await db.variant.findFirstOrThrow({
              where: {
                productId: cutout.productId,
                colorId: cutout.colorId,
                isActive: true,
              },
              orderBy: { id: "asc" },
            })
          ).id,
        );
      }
      state.token = prefix;
      cartId = (
        await db.cart.create({
          data: {
            tokenHash: tokenHash(state.token),
            customerId: null,
            marketId: state.market.id,
            currency: state.market.currency,
            locale: "en",
            expiresAt: new Date(Date.now() + 86400000),
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (integration)
        await db.integration.update({
          where: { id: integration.id },
          data: {
            config: integration.config as Prisma.InputJsonValue,
            isActive: integration.isActive,
          },
        });
      await db.customerInstantLook.deleteMany({
        where: { customerId: { in: [first, second, guest] } },
      });
      if (cartId) await db.cart.delete({ where: { id: cartId } });
      await db.customer.updateMany({
        where: { id: { in: [first, second, guest] } },
        data: { isActive: false },
      });
      vi.restoreAllMocks();
    });
    it("resolves actual four models and variant override geometry, independently of paid integration or keys", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => {
          throw new Error("No external call allowed");
        });
      const before = await db.fittingCoinEntry.count();
      for (const [modelId, key] of [
        ["woman", "women-tee"],
        ["man", "men-shirt"],
        ["girl", "kids-dress"],
        ["boy", "kids-knit"],
      ]) {
        const approved = await db.catalogCutout.findFirstOrThrow({
          where: { productId: `seed-moda4-style-${key}`, deletedAt: null },
        });
        const v = await db.variant.findFirstOrThrow({
          where: {
            productId: approved.productId,
            colorId: approved.colorId,
            isActive: true,
            color: { deletedAt: null },
            size: { deletedAt: null },
          },
          orderBy: { id: "asc" },
        });
        const r = await resolveInstantSelection(state.market.id, {
          modelId,
          variantIds: [v.id],
        });
        expect(r.model.id).toBe(modelId);
        expect(r.layers[0].variantId).toBe(v.id);
        expect(r.layers[0].geometry.modelId).toBe(modelId);
      }
      const v = await db.variant.findUniqueOrThrow({ where: { id: ids[0] } }),
        shared = await db.catalogCutout.findFirstOrThrow({
          where: {
            productId: v.productId,
            colorId: v.colorId,
            variantId: null,
            deletedAt: null,
          },
        });
      const { id: oldId, createdAt, updatedAt, ...data } = shared;
      void oldId;
      void createdAt;
      void updatedAt;
      const geometry = structuredClone(shared.geometry) as {
        version: number;
        models: { modelId: string; x: number }[];
      };
      geometry.models.find((m) => m.modelId === "woman")!.x = 0.41;
      const override = await db.catalogCutout.create({
        data: {
          ...data,
          variantId: v.id,
          geometry: geometry as Prisma.InputJsonValue,
          validation: shared.validation as Prisma.InputJsonValue,
          version: 7,
        },
      });
      try {
        const r = await resolveInstantSelection(state.market.id, {
          modelId: "woman",
          variantIds: [v.id],
        });
        expect(r.layers[0].geometry.x).toBe(0.41);
        expect(r.snapshot.revisions[0].profileVersion).toBe(7);
      } finally {
        await db.catalogCutout.delete({ where: { id: override.id } });
      }
      expect(await db.fittingCoinEntry.count()).toBe(before);
      expect(fetch).not.toHaveBeenCalled();
      fetch.mockRestore();
    });
    it("denies guest and forged identity, foreign read/update/archive/delete with no cross-owner mutation", async () => {
      state.customer = "";
      await expect(save()).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
      state.customer = guest;
      await expect(save()).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
      state.customer = first;
      await expect(save("Forged", { customerId: second })).rejects.toThrow();
      const row = await save();
      state.customer = second;
      expect(await instantLooks("en")).toEqual([]);
      await expect(
        save("Foreign", { id: row.id, expectedVersion: row.version }),
      ).rejects.toMatchObject({ code: "STALE" });
      for (const operation of ["archive", "restore", "delete"])
        await expect(
          mutateInstantLook("en", {
            id: row.id,
            expectedVersion: row.version,
            operation,
            confirm: true,
          }),
        ).rejects.toMatchObject({ code: "STALE" });
      expect(
        (
          await db.customerInstantLook.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).customerId,
      ).toBe(first);
      state.customer = first;
    });
    it("serializes exact create replay and optimistic updates, retaining owner scope on archive/restore/delete", async () => {
      const resolved = await resolveInstantSelection(state.market.id, input()),
        proposal = {
          ...input(),
          name: "Concurrent",
          requestKey: randomUUID(),
          fingerprint: resolved.fingerprint,
        };
      const [a, b] = await Promise.all([
        saveInstantLook("en", proposal),
        saveInstantLook("en", proposal),
      ]);
      expect(a).toEqual(b);
      await expect(
        saveInstantLook("en", { ...proposal, name: "Different" }),
      ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
      const updates = await Promise.allSettled([
        saveInstantLook("en", {
          ...proposal,
          id: a.id,
          expectedVersion: 1,
          name: "Update A",
        }),
        saveInstantLook("en", {
          ...proposal,
          id: a.id,
          expectedVersion: 1,
          name: "Update B",
        }),
      ]);
      expect(updates.filter((v) => v.status === "fulfilled")).toHaveLength(1);
      expect(updates.filter((v) => v.status === "rejected")).toHaveLength(1);
      await expect(saveInstantLook("en", proposal)).rejects.toMatchObject({
        code: "REQUEST_CONFLICT",
      });
      await mutateInstantLook("en", {
        id: a.id,
        expectedVersion: 2,
        operation: "archive",
        confirm: true,
      });
      expect((await instantLooks("en")).some((v) => v.id === a.id)).toBe(false);
      expect((await instantLooks("en", true)).some((v) => v.id === a.id)).toBe(
        true,
      );
      await mutateInstantLook("en", {
        id: a.id,
        expectedVersion: 3,
        operation: "restore",
        confirm: true,
      });
      await mutateInstantLook("en", {
        id: a.id,
        expectedVersion: 4,
        operation: "delete",
        confirm: true,
      });
      expect(
        await db.customerInstantLook.findUnique({ where: { id: a.id } }),
      ).toBeNull();
    });
    it("rejects incompatible/max4 slots and changed cutout revisions; current prices are never saved", async () => {
      await expect(
        resolveInstantSelection(state.market.id, {
          modelId: "woman",
          variantIds: [...ids, ...ids, ...ids],
        }),
      ).rejects.toThrow();
      const dress = await db.variant.findFirstOrThrow({
        where: { productId: "seed-moda4-style-women-dress" },
      });
      await expect(
        resolveInstantSelection(state.market.id, {
          modelId: "woman",
          variantIds: [ids[0], dress.id],
        }),
      ).rejects.toMatchObject({ code: "INVALID_COMBINATION" });
      const r = await resolveInstantSelection(state.market.id, input()),
        profile = await db.catalogCutout.findUniqueOrThrow({
          where: { id: r.snapshot.revisions[0].profileId },
        });
      await db.catalogCutout.update({
        where: { id: profile.id },
        data: { version: { increment: 1 } },
      });
      try {
        await expect(
          saveInstantLook("en", {
            ...input(),
            name: "Stale pixels",
            requestKey: randomUUID(),
            fingerprint: r.fingerprint,
          }),
        ).rejects.toMatchObject({ code: "STALE" });
      } finally {
        await db.catalogCutout.update({
          where: { id: profile.id },
          data: { version: profile.version },
        });
      }
      const row = await save("No stored price");
      const stored = await db.customerInstantLook.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(JSON.stringify(stored.snapshot)).not.toMatch(
        /amount|price|currency|storageKey|imageUrl/,
      );
      const catalog = await instantCatalog(state.market.id, "en", "", {
        variantIds: ids,
      });
      expect(catalog).toHaveLength(2);
      expect(catalog.every((v) => v.amount !== null && v.available)).toBe(true);
    });
    it("adds the whole validated guest composition atomically and rejects stale references without partial changes or coins", async () => {
      state.customer = "";
      const before = await db.fittingCoinEntry.count(),
        sessions = await db.fittingSession.count(),
        r = await resolveInstantSelection(state.market.id, input());
      await expect(
        addInstantItems("en", { ...input(), fingerprint: "0".repeat(64) }),
      ).rejects.toMatchObject({ code: "STALE" });
      expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
      await addInstantItems("en", { ...input(), fingerprint: r.fingerprint });
      expect(
        (await db.cartItem.findMany({ where: { cartId } }))
          .map((v) => v.variantId)
          .sort(),
      ).toEqual([...ids].sort());
      expect(await db.fittingCoinEntry.count()).toBe(before);
      expect(await db.fittingSession.count()).toBe(sessions);
      state.customer = first;
    });
    it("exports only owner market compositions through an approved request and deletes without touching commerce", async () => {
      const row = await save("Exported instant");
      const request = await db.privacyRequest.create({
        data: {
          customerId: first,
          marketId: state.market.id,
          kind: "EXPORT",
          status: "APPROVED",
        },
      });
      const exported = await exportPersonalData(request.id);
      expect(exported.instantLooks.some((v) => v.id === row.id)).toBe(true);
      state.customer = second;
      await expect(exportPersonalData(request.id)).rejects.toThrow();
      state.customer = first;
      const orders = await db.order.count(),
        entries = await db.fittingCoinEntry.count();
      await mutateInstantLook("en", {
        id: row.id,
        expectedVersion: 1,
        operation: "delete",
        confirm: true,
      });
      expect(await db.order.count()).toBe(orders);
      expect(await db.fittingCoinEntry.count()).toBe(entries);
    });
    it("preserves the independent free switch for legacy settings payloads and enforces it without a paid key", async () => {
      const old = await db.integration.findUniqueOrThrow({
        where: { key: "fitting-room" },
      });
      const config = configSchema.parse(old.config);
      delete config.instantEnabled;
      await saveFittingSettings({
        config,
        version: old.updatedAt.toISOString(),
        confirm: true,
      });
      const preserved = await db.integration.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(
        (preserved.config as { instantEnabled: boolean }).instantEnabled,
      ).toBe(true);
      expect(preserved.isActive).toBe(false);
      await saveFittingSettings({
        config: { ...config, instantEnabled: false },
        version: preserved.updatedAt.toISOString(),
        confirm: true,
      });
      await expect(
        resolveInstantSelection(state.market.id, input()),
      ).rejects.toMatchObject({ code: "DISABLED" });
      const disabled = await db.integration.findUniqueOrThrow({
        where: { id: old.id },
      });
      await saveFittingSettings({
        config: { ...config, instantEnabled: true },
        version: disabled.updatedAt.toISOString(),
        confirm: true,
      });
      expect(
        (await resolveInstantSelection(state.market.id, input())).layers,
      ).toHaveLength(2);
    });
  },
);
