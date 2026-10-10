import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const state = vi.hoisted(() => ({
  actor: null as string | null,
  customer: null as string | null,
  maintenance: false,
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (state.actor ? { user: { id: state.actor } } : null),
}));
vi.mock("@/modules/settings", () => ({
  isMaintenanceOn: async () => state.maintenance,
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () =>
    state.customer
      ? db.customer.findUnique({ where: { id: state.customer } })
      : null,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: () => {},
  revalidateTag: () => {},
}));
import { db } from "@/lib/db";
import { configSchema } from "@/modules/fitting/contracts";
import {
  createFittingSession,
  walletView,
  refundSession,
  sessionView,
  saveLook,
  savedLooks,
  ownedVariantIds,
  fittingProducts,
} from "@/modules/fitting";
import {
  lockWallet,
  grantCoins,
  allowances,
  usableGrants,
  creditPaidOrder,
  revokeReturnedCoins,
} from "@/modules/fitting/ledger";
import {
  saveFittingSettings,
  fittingSettings,
  grantFittingCoins,
} from "@/modules/fitting/settings";
import { renderFitting, registerFittingJobs } from "@/modules/fitting/worker";
import { JobDeferredError, runJobs } from "@/modules/jobs";
import { ProviderFailure } from "@/modules/integrations/fitting";
import { GET as imageGET } from "@/app/api/fitting/[id]/image/route";
import { storage } from "@/modules/integrations/storage";
import { returnFixture } from "../helpers/returns";
import { transition } from "@/modules/orders/service";
import { validateCategoryParent } from "@/modules/catalog/tree";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "fitting room: real PostgreSQL and private local storage",
  () => {
    let marketId: string,
      ownerId: string,
      original: Awaited<ReturnType<typeof db.integration.findUnique>>,
      bytes: Buffer;
    const customers: string[] = [];
    const outputKeys: string[] = [];
    const defaultConfig = configSchema.parse({
      enabled: true,
      welcomeCoins: "0",
      dailyFreeUses: 0,
      dailyLimit: 0,
      globalDailyLimit: 10000,
      models: [
        {
          id: "woman",
          kind: "WOMAN",
          mediaId: "seed-fashion-v2-look-women-coat",
          label: { fa: "مدل", tr: "Model", en: "Model" },
          enabled: true,
        },
      ],
    });
    async function configure(patch: Partial<typeof defaultConfig> = {}) {
      const config = { ...defaultConfig, ...patch };
      await db.integration.upsert({
        where: { key: "fitting-room" },
        create: {
          key: "fitting-room",
          provider: "openai",
          isActive: config.enabled,
          config,
        },
        update: { isActive: config.enabled, config },
      });
      return config;
    }
    async function customer(coins = "100") {
      const c = await db.customer.create({
        data: { email: `fit-${randomUUID()}@example.com`, isGuest: false },
      });
      customers.push(c.id);
      if (coins !== "0")
        await db.$transaction(async (tx) => {
          await lockWallet(tx, c.id);
          await grantCoins(tx, c.id, "test-start", "MANUAL", coins);
        });
      return c;
    }
    const input = (extra: Record<string, unknown> = {}) => ({
      requestKey: randomUUID(),
      modelId: "woman",
      variantIds: [
        "seed-style-v2-women-tee-m",
        "seed-style-v2-women-trousers-m",
      ],
      expectedCostCoins: "12.5",
      confirm: true,
      ...extra,
    });
    async function create(id: string, extra: Record<string, unknown> = {}) {
      return createFittingSession(id, marketId, "en", input(extra));
    }
    async function balance(id: string) {
      return (await walletView(id)).balance;
    }
    beforeAll(async () => {
      original = await db.integration.findUnique({
        where: { key: "fitting-room" },
      });
      marketId = (await db.market.findUniqueOrThrow({ where: { code: "TR" } }))
        .id;
      ownerId = (
        await db.user.findFirstOrThrow({
          where: { roles: { some: { role: { key: "owner" } } } },
        })
      ).id;
      bytes = await sharp({
        create: { width: 64, height: 96, channels: 3, background: "#ded5c5" },
      })
        .webp()
        .toBuffer();
      vi.stubEnv("FITTING_OPENAI_API_KEY", "fixture-key-never-sent");
    });
    beforeEach(async () => {
      state.actor = ownerId;
      state.customer = null;
      state.maintenance = false;
      await configure();
    });
    afterAll(async () => {
      const sessions = await db.fittingSession.findMany({
        where: { customerId: { in: customers } },
      });
      if (sessions.length)
        await db.job.deleteMany({
          where: {
            type: "fitting-render",
            OR: sessions.map((s) => ({
              payload: { path: ["sessionId"], equals: s.id },
            })),
          },
        });
      if (original)
        await db.integration.update({
          where: { id: original.id },
          data: {
            config: original.config ?? {},
            isActive: original.isActive,
            provider: original.provider,
          },
        });
      else await db.integration.deleteMany({ where: { key: "fitting-room" } });
      for (const key of outputKeys) await storage.delete(key);
      vi.unstubAllEnvs();
    });
    it("does not grant welcome/daily credit while disabled", async () => {
      await configure({
        enabled: false,
        welcomeCoins: "62.5",
        dailyFreeUses: 2,
      });
      const c = await customer("0");
      expect(await balance(c.id)).toBe("0");
      await expect(create(c.id)).rejects.toThrow("DISABLED");
      expect(
        await db.fittingSession.count({ where: { customerId: c.id } }),
      ).toBe(0);
    });
    it("defers interrupted paid rendering through maintenance and reviews it without redispatch", async () => {
      const c = await customer(),
        s = await create(c.id);
      const provider = {
        render: vi.fn(async () => {
          state.maintenance = true;
          return bytes;
        }),
      };
      registerFittingJobs(provider);
      const put = vi.spyOn(storage, "put");
      const job = await db.job.findFirstOrThrow({
        where: {
          type: "fitting-render",
          payload: { path: ["sessionId"], equals: s.id },
        },
      });
      try {
        await runJobs(["fitting-render"]);
        const deferred = await db.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(deferred.status).toBe("PENDING");
        expect(deferred.attempts).toBe(0);
        state.maintenance = false;
        await db.job.update({
          where: { id: job.id },
          data: { runAt: new Date(0) },
        });
        await runJobs(["fitting-render"]);
        const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(fresh.status).toBe("PENDING");
        expect(fresh.attempts).toBe(0);
        expect(fresh.runAt.getTime()).toBeGreaterThan(Date.now());
        await db.fittingSession.update({
          where: { id: s.id },
          data: { startedAt: new Date(Date.now() - 6 * 60000) },
        });
        await db.job.update({
          where: { id: job.id },
          data: { runAt: new Date(0) },
        });
        await runJobs(["fitting-render"]);
        expect(
          (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
        ).toBe("DONE");
        expect((await sessionView(c.id, s.id)).status).toBe("REVIEW");
        expect(provider.render).toHaveBeenCalledTimes(1);
        expect(await balance(c.id)).toBe("87.5");
      } finally {
        state.maintenance = false;
        outputKeys.push(...put.mock.calls.map(([key]) => key));
        put.mockRestore();
        registerFittingJobs();
      }
    });
    it("serializes simultaneous requests without overspend", async () => {
      const c = await customer("50");
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => create(c.id)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
      expect(await balance(c.id)).toBe("0");
      expect(
        await db.fittingCoinEntry.count({
          where: { customerId: c.id, reason: "FITTING" },
        }),
      ).toBe(4);
    });
    it("replays exactly once and rejects changed payload without writes", async () => {
      const c = await customer(),
        r = input();
      const [a, b] = await Promise.all([
        createFittingSession(c.id, marketId, "en", r),
        createFittingSession(c.id, marketId, "en", r),
      ]);
      expect(a.id).toBe(b.id);
      expect(await balance(c.id)).toBe("87.5");
      await expect(
        createFittingSession(c.id, marketId, "en", {
          ...r,
          variantIds: ["seed-style-v2-women-knit-m"],
        }),
      ).rejects.toThrow("REQUEST_CONFLICT");
      expect(await balance(c.id)).toBe("87.5");
    });
    it.each([
      { expectedCostCoins: "13" },
      { confirm: false },
      {
        variantIds: ["seed-style-v2-women-tee-m", "seed-style-v2-women-tee-s"],
      },
      { variantIds: ["seed-style-v2-men-tee-m"] },
      {
        variantIds: ["seed-style-v2-women-tee-m", "seed-style-v2-women-knit-m"],
      },
      { variantIds: ["missing"] },
      { variantIds: ["seed-fitting-pack-100-digital"] },
    ])("rejects invalid/changed combinations atomically: %j", async (patch) => {
      const c = await customer();
      await expect(create(c.id, patch)).rejects.toThrow();
      expect(await balance(c.id)).toBe("100");
      expect(
        await db.fittingSession.count({ where: { customerId: c.id } }),
      ).toBe(0);
    });
    it("enforces daily cap and does not replenish same-day credit after changing settings", async () => {
      await configure({ dailyLimit: 1, dailyFreeUses: 1 });
      const c = await customer("0");
      const a = await create(c.id);
      expect(await balance(c.id)).toBe("0");
      await configure({ dailyLimit: 1, dailyFreeUses: 10 });
      expect(await balance(c.id)).toBe("0");
      await expect(create(c.id)).rejects.toThrow("DAILY_LIMIT");
      await db.$transaction((tx) => refundSession(tx, a.id, "TEST"));
      expect(await balance(c.id)).toBe("12.5");
    });
    it("expires old daily lots and grants only the current timezone day", async () => {
      const c = await customer("0");
      await db.$transaction(async (tx) => {
        await lockWallet(tx, c.id);
        await allowances(
          tx,
          c.id,
          { ...defaultConfig, dailyFreeUses: 2 },
          new Date(Date.now() - 3 * 86400000),
        );
        expect(await usableGrants(tx, c.id, new Date())).toHaveLength(0);
      });
      await configure({ dailyFreeUses: 2 });
      expect(await balance(c.id)).toBe("25");
      expect(await balance(c.id)).toBe("25");
    });
    it("renders once, saves a look and serves only the authenticated owner", async () => {
      const c = await customer(),
        s = await create(c.id),
        provider = { render: vi.fn(async () => bytes) };
      const attempts = await Promise.allSettled([
        renderFitting(s.id, provider),
        renderFitting(s.id, provider),
      ]);
      expect(attempts.some((r) => r.status === "fulfilled")).toBe(true);
      for (const result of attempts)
        if (result.status === "rejected")
          expect(result.reason).toBeInstanceOf(JobDeferredError);
      expect(provider.render).toHaveBeenCalledTimes(1);
      expect((await sessionView(c.id, s.id)).status).toBe("DONE");
      await renderFitting(s.id, provider);
      expect(provider.render).toHaveBeenCalledTimes(1);
      await saveLook(c.id, s.id, "City layers");
      expect(await savedLooks(c.id)).toEqual([
        {
          id: s.id,
          name: "City layers",
          imageUrl: `/api/fitting/${s.id}/image`,
        },
      ]);
      const session = await db.fittingSession.findUniqueOrThrow({
        where: { id: s.id },
      });
      outputKeys.push(session.storageKey!);
      const ciphertext = await storage.getBytes(session.storageKey!);
      expect(ciphertext!.subarray(0, 4).toString()).not.toBe("RIFF");
      expect(
        await db.media.count({ where: { storageKey: session.storageKey! } }),
      ).toBe(0);
      state.customer = c.id;
      const response = await imageGET(new Request("http://app.invalid"), {
        params: Promise.resolve({ id: s.id }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
      state.customer = (await customer()).id;
      expect(
        (
          await imageGET(new Request("http://app.invalid"), {
            params: Promise.resolve({ id: s.id }),
          })
        ).status,
      ).toBe(404);
      await expect(sessionView(state.customer, s.id)).rejects.toThrow(
        "NOT_FOUND",
      );
    });
    it("refunds definite failure once and never retries unknown remote outcomes", async () => {
      const c = await customer(),
        s = await create(c.id),
        bad = {
          render: vi.fn(async () => {
            throw new ProviderFailure(true);
          }),
        };
      await renderFitting(s.id, bad);
      await renderFitting(s.id, bad);
      expect(bad.render).toHaveBeenCalledTimes(1);
      expect(await balance(c.id)).toBe("100");
      const uncertain = await create(c.id),
        network = {
          render: vi.fn(async () => {
            throw new ProviderFailure(false);
          }),
        };
      await renderFitting(uncertain.id, network);
      await renderFitting(uncertain.id, network);
      expect(network.render).toHaveBeenCalledTimes(1);
      expect((await sessionView(c.id, uncertain.id)).status).toBe("REVIEW");
      expect(await balance(c.id)).toBe("87.5");
    });
    it.each(["storage", "encryption"])(
      "refunds a definite %s delivery failure once",
      async (failure) => {
        const c = await customer(),
          s = await create(c.id);
        const provider = { render: vi.fn(async () => bytes) };
        const secret = process.env.AUTH_SECRET;
        const put =
          failure === "storage"
            ? vi
                .spyOn(storage, "put")
                .mockRejectedValue(new Error("fixture storage failure"))
            : null;
        if (failure === "encryption") process.env.AUTH_SECRET = "";
        try {
          await renderFitting(s.id, provider);
          await renderFitting(s.id, provider);
          expect(provider.render).toHaveBeenCalledTimes(1);
          expect((await sessionView(c.id, s.id)).status).toBe("FAILED");
          expect(await balance(c.id)).toBe("100");
          expect(
            await db.fittingCoinEntry.count({
              where: { customerId: c.id, sourceKey: `refund:${s.id}` },
            }),
          ).toBe(1);
        } finally {
          put?.mockRestore();
          if (secret === undefined) delete process.env.AUTH_SECRET;
          else process.env.AUTH_SECRET = secret;
        }
      },
    );
    it("locks concurrent refunds and keeps source identity, journal and charge immutable", async () => {
      const c = await customer(),
        s = await create(c.id);
      await Promise.all([
        db.$transaction((tx) => refundSession(tx, s.id, "TEST")),
        db.$transaction((tx) => refundSession(tx, s.id, "TEST")),
      ]);
      expect(await balance(c.id)).toBe("100");
      expect(
        await db.fittingCoinEntry.count({
          where: { customerId: c.id, sourceKey: `refund:${s.id}` },
        }),
      ).toBe(1);
      await expect(
        db.fittingSession.update({
          where: { id: s.id },
          data: { costCoins: "1" },
        }),
      ).rejects.toThrow();
      await expect(
        db.fittingCoinEntry.updateMany({
          where: { customerId: c.id },
          data: { amount: "0" },
        }),
      ).rejects.toThrow();
      await expect(
        db.fittingCoinGrant.updateMany({
          where: { customerId: c.id },
          data: { amount: "200" },
        }),
      ).rejects.toThrow();
    });
    it("rejects guest, inactive and unauthorized admin requests without grants", async () => {
      const c = await customer("0");
      await db.customer.update({
        where: { id: c.id },
        data: { isActive: false },
      });
      await expect(create(c.id)).rejects.toThrow("LOGIN_REQUIRED");
      state.actor = null;
      await expect(
        grantFittingCoins({
          requestKey: randomUUID(),
          customerIds: [c.id],
          amount: "100",
          expiresAt: null,
          reason: "test",
          confirm: true,
        }),
      ).rejects.toThrow("UNAUTHENTICATED");
      expect(
        await db.fittingCoinGrant.count({ where: { customerId: c.id } }),
      ).toBe(0);
    });
    it("saves versioned admin settings and grants exact batch credits idempotently", async () => {
      const a = await customer("0"),
        b = await customer("0"),
        settings = await fittingSettings();
      await saveFittingSettings({
        version: settings.integration,
        config: { ...defaultConfig, costCoins: "12.5" },
        confirm: true,
      });
      await expect(
        saveFittingSettings({
          version: settings.integration,
          config: defaultConfig,
          confirm: true,
        }),
      ).rejects.toThrow("STALE");
      const request = {
        requestKey: randomUUID(),
        customerIds: [a.id, b.id],
        amount: "12.5001",
        expiresAt: null,
        reason: "loyalty",
        confirm: true,
      };
      await Promise.all([
        grantFittingCoins(request),
        grantFittingCoins(request),
      ]);
      expect(await balance(a.id)).toBe("12.5001");
      expect(await balance(b.id)).toBe("12.5001");
      await expect(
        grantFittingCoins({ ...request, amount: "20" }),
      ).rejects.toThrow("REQUEST_CONFLICT");
    });
    it("credits a snapshotted pack only after the real PAID transition and once", async () => {
      const f = await returnFixture(db, {
        customerId: (await customer("0")).id,
        pending: true,
        quantity: 2,
        coinPackCoins: "100",
      });
      customers.push(f.customer.id);
      await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
      expect(await balance(f.customer.id)).toBe("0");
      await db.$transaction((tx) => transition(tx, f.order, "PAID", ownerId));
      await Promise.all([
        db.$transaction((tx) => creditPaidOrder(tx, f.order.id)),
        db.$transaction((tx) => creditPaidOrder(tx, f.order.id)),
      ]);
      expect(await balance(f.customer.id)).toBe("200");
      expect(
        await db.fittingCoinGrant.count({
          where: { customerId: f.customer.id, reason: "PACK" },
        }),
      ).toBe(1);
      expect(
        (await ownedVariantIds(db, f.customer.id)).has(f.variants[0].id),
      ).toBe(false);
    });
    it("reclaims returned pack coins after spending and correctly refunds the pending usage", async () => {
      const f = await returnFixture(db, {
        customerId: (await customer("0")).id,
        coinPackCoins: "100",
        quantity: 2,
      });
      customers.push(f.customer.id);
      await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
      const session = await create(f.customer.id);
      await db.returnRequest.create({
        data: {
          orderId: f.order.id,
          customerId: f.customer.id,
          type: "RETURN",
          reasonCode: "OTHER",
          status: "RESOLVED",
          resolution: "REFUND",
          items: {
            create: {
              orderItemId: f.order.items[0].id,
              quantity: 2,
              condition: "RESTOCK",
            },
          },
        },
      });
      await Promise.all([
        db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id)),
        db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id)),
      ]);
      expect(await balance(f.customer.id)).toBe("0");
      expect(
        (
          await db.fittingWallet.findUniqueOrThrow({
            where: { customerId: f.customer.id },
          })
        ).debt.toString(),
      ).toBe("12.5");
      await db.$transaction((tx) => refundSession(tx, session.id, "TEST"));
      expect(await balance(f.customer.id)).toBe("0");
      expect(
        (
          await db.fittingWallet.findUniqueOrThrow({
            where: { customerId: f.customer.id },
          })
        ).debt.toString(),
      ).toBe("0");
    });
    it("keeps paid garments in the wardrobe even when no longer active for sale", async () => {
      const f = await returnFixture(db);
      customers.push(f.customer.id);
      await db.product.update({
        where: { id: f.variants[0].productId },
        data: { status: "ARCHIVED" },
      });
      await db.productMedia.create({
        data: {
          productId: f.variants[0].productId,
          mediaId: "seed-fashion-v2-women-tee",
        },
      });
      expect(
        (await ownedVariantIds(db, f.customer.id)).has(f.variants[0].id),
      ).toBe(true);
      expect(
        (await fittingProducts(f.customer.id, marketId, "fa", "", true)).some(
          (p) => p.variantId === f.variants[0].id && p.owned,
        ),
      ).toBe(true);
    });
    it("excludes unclassified shop garments but permits already owned legacy references", async () => {
      const c = await customer();
      const originalProduct = await db.product.findUniqueOrThrow({
        where: { id: "seed-style-v2-women-tee" },
      });
      try {
        await db.product.update({
          where: { id: originalProduct.id },
          data: { fittingSlot: null },
        });
        expect(
          (await fittingProducts(c.id, marketId, "en")).some(
            (p) => p.productId === originalProduct.id,
          ),
        ).toBe(false);
        await expect(create(c.id)).rejects.toThrow("INVALID_SELECTION");
        expect(await balance(c.id)).toBe("100");
        const owned = await returnFixture(db, { customerId: c.id });
        await db.productMedia.create({
          data: {
            productId: owned.variants[0].productId,
            mediaId: "seed-fashion-v2-women-tee",
          },
        });
        expect(
          (await fittingProducts(c.id, marketId, "en", "", true)).some(
            (p) => p.variantId === owned.variants[0].id,
          ),
        ).toBe(true);
        await create(c.id, { variantIds: [owned.variants[0].id] });
        expect(await balance(c.id)).toBe("87.5");
      } finally {
        await db.product.update({
          where: { id: originalProduct.id },
          data: { fittingSlot: originalProduct.fittingSlot },
        });
      }
    });
    it("prevents concurrent category moves from creating a cycle", async () => {
      const id = randomUUID(),
        a = await db.category.create({
          data: {
            gender: "UNISEX",
            titleI18n: { en: "A" },
            slugI18n: { en: id + "-a" },
          },
        }),
        b = await db.category.create({
          data: {
            gender: "UNISEX",
            titleI18n: { en: "B" },
            slugI18n: { en: id + "-b" },
          },
        });
      try {
        const result = await Promise.allSettled([
          db.$transaction(async (tx) => {
            await validateCategoryParent(tx, a.id, b.id);
            await tx.category.update({
              where: { id: a.id },
              data: { parentId: b.id },
            });
          }),
          db.$transaction(async (tx) => {
            await validateCategoryParent(tx, b.id, a.id);
            await tx.category.update({
              where: { id: b.id },
              data: { parentId: a.id },
            });
          }),
        ]);
        expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      } finally {
        // Retain fixtures as archived records, without leaking root cards into e2e.
        await db.category.updateMany({
          where: { id: { in: [a.id, b.id] } },
          data: { deletedAt: new Date() },
        });
      }
    });
    it("retains reward rule snapshots and reverses only returned purchase value", async () => {
      await configure({
        rewards: [{ marketId, spendAmount: "100", coins: "25" }],
      });
      const f = await returnFixture(db, {
        customerId: (await customer("0")).id,
        quantity: 2,
        price: "100",
      });
      customers.push(f.customer.id);
      await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
      expect(await balance(f.customer.id)).toBe("50");
      await configure({
        rewards: [{ marketId, spendAmount: "1000", coins: "5" }],
      });
      await db.returnRequest.create({
        data: {
          type: "RETURN",
          orderId: f.order.id,
          customerId: f.customer.id,
          reasonCode: "OTHER",
          status: "RESOLVED",
          resolution: "REFUND",
          items: {
            create: {
              orderItemId: f.order.items[0].id,
              quantity: 1,
              condition: "RESTOCK",
            },
          },
        },
      });
      await db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id));
      expect(await balance(f.customer.id)).toBe("25");
      const pack = await returnFixture(db, {
        customerId: (await customer("0")).id,
        coinPackCoins: "100",
        quantity: 1,
        price: "1000",
      });
      customers.push(pack.customer.id);
      await db.$transaction((tx) => creditPaidOrder(tx, pack.order.id));
      expect(await balance(pack.customer.id)).toBe("100");
      expect(
        await db.fittingCoinGrant.count({
          where: { customerId: pack.customer.id, reason: "PURCHASE" },
        }),
      ).toBe(0);
    });
    it("refunds partially revoked in-flight allocations without minting unearned coins", async () => {
      const f = await returnFixture(db, {
        customerId: (await customer("0")).id,
        coinPackCoins: "50",
        quantity: 2,
      });
      customers.push(f.customer.id);
      await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
      const sessions = await Promise.all(
        Array.from({ length: 8 }, () => create(f.customer.id)),
      );
      await db.returnRequest.create({
        data: {
          type: "RETURN",
          orderId: f.order.id,
          customerId: f.customer.id,
          reasonCode: "OTHER",
          status: "RESOLVED",
          resolution: "REFUND",
          items: {
            create: {
              orderItemId: f.order.items[0].id,
              quantity: 1,
              condition: "RESTOCK",
            },
          },
        },
      });
      await db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id));
      expect(
        (
          await db.fittingWallet.findUniqueOrThrow({
            where: { customerId: f.customer.id },
          })
        ).debt.toString(),
      ).toBe("50");
      for (const s of sessions)
        await db.$transaction((tx) => refundSession(tx, s.id, "TEST"));
      expect(await balance(f.customer.id)).toBe("50");
      expect(
        (
          await db.fittingWallet.findUniqueOrThrow({
            where: { customerId: f.customer.id },
          })
        ).debt.toString(),
      ).toBe("0");
    });
    it("seed adds four approved fixed models, draft packs, child branches and real variant-color media", async () => {
      const models = (original?.config as { models: { mediaId: string }[] })
        .models;
      expect(models).toHaveLength(4);
      expect(
        await db.media.count({
          where: { id: { in: models.map((m) => m.mediaId) }, status: "READY" },
        }),
      ).toBe(4);
      for (const amount of ["100", "500", "1000"]) {
        const p = await db.product.findUniqueOrThrow({
          where: { id: `seed-fitting-pack-${amount}` },
        });
        expect(p.coinPackCoins?.toString()).toBe(amount);
        expect(p.status).toBe("DRAFT");
      }
      for (const kind of ["girls", "boys", "baby"])
        expect(
          await db.category.count({
            where: { parentId: `seed-category-kids-${kind}` },
          }),
        ).toBe(5);
      const v = await db.variant.findUniqueOrThrow({
        where: { id: "seed-style-v2-women-tee-charcoal-m" },
        include: { color: true, media: { include: { media: true } } },
      });
      expect(v.color.code).toBe("CHARCOAL");
      expect(v.media[0].media.originalName).toBe(
        "demo-fashion-v2-women-tee-charcoal.webp",
      );
    });
  },
);
