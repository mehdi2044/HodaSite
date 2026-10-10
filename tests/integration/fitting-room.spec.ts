import { randomUUID } from "node:crypto";
import sharp from "sharp";
import Decimal from "decimal.js";
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
import { MaintenanceError } from "@/lib/mutation-gate";
import { inFlightCount } from "@/lib/request-metrics";
import { configSchema, dayBounds } from "@/modules/fitting/contracts";
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
  fittingRecipients,
  fittingRecipientMarkets,
  resolveFittingSession,
} from "@/modules/fitting/settings";
import { renderFitting, registerFittingJobs } from "@/modules/fitting/worker";
import { JobDeferredError, runJobs } from "@/modules/jobs";
import { ProviderFailure } from "@/modules/integrations/fitting";
import { GET as imageGET } from "@/app/api/fitting/[id]/image/route";
import { storage } from "@/modules/integrations/storage";
import { returnFixture } from "../helpers/returns";
import { requestReturn, manageReturn } from "@/modules/returns/service";
import { unusableFittingResponses } from "../helpers/fitting-provider-responses";
import {
  findProductBySlug,
  listCatalogProducts,
  listBestsellers,
} from "@/modules/catalog";
import { homepageProducts } from "@/modules/content/homepage-products";
import { homepageBlocksSchema } from "@/modules/content/homepage";
import { GET as suggestGET } from "@/app/api/catalog/suggest/route";
import { validateLookReferences } from "@/modules/outfits";
import { styleLookBlock } from "../../prisma/style-seed";
import { publicCards, mergeWishlist, wishlist } from "@/modules/engagement";
import { transition } from "@/modules/orders/service";
import { validateCategoryParent } from "@/modules/catalog/tree";
import { returnAmount } from "@/modules/returns/validation";
import { saveHomepage } from "@/app/admin/(dashboard)/content/homepage/actions";
import { duplicateProduct } from "@/app/admin/(dashboard)/catalog/products/actions";

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
            type: { in: ["fitting-render", "fitting-output-purge"] },
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
      for (const key of new Set([
        ...outputKeys,
        ...sessions.flatMap((s) => (s.storageKey ? [s.storageKey] : [])),
      ]))
        await storage.delete(key);
      vi.unstubAllEnvs();
    });
    it.each([
      { enabled: false, coinSalesEnabled: true },
      { enabled: true, coinSalesEnabled: false },
    ])(
      "hides active packs across public catalog surfaces when toggles are %j",
      async (toggles) => {
        const f = await returnFixture(db, { coinPackCoins: "100" });
        const productId = f.variants[0].productId;
        const marker = `coinvisibility${randomUUID().replaceAll("-", "")}`;
        await db.product.update({
          where: { id: productId },
          data: {
            marketIds: [marketId],
            slugI18n: { en: marker },
            searchText: marker,
          },
        });
        const visible = async (expected: boolean) => {
          for (const filters of [
            {},
            { q: marker },
            { q: marker, sort: "price-asc" as const },
          ]) {
            expect(
              (await listCatalogProducts(marketId, "en", filters)).items.some(
                (p) => p.id === productId,
              ),
            ).toBe(expected);
          }
          expect(
            (await listBestsellers(marketId, 12)).some(
              (p) => p.id === productId,
            ),
          ).toBe(expected);
          expect(
            (
              await homepageProducts(marketId, "en", {
                mode: "latest",
                limit: 12,
              })
            ).items.some((p) => p.id === productId),
          ).toBe(expected);
          expect(Boolean(await findProductBySlug(marketId, "en", marker))).toBe(
            expected,
          );
          expect(
            (
              await findProductBySlug(marketId, "en", marker, {
                includeInactive: true,
              })
            )?.id,
          ).toBe(productId);
          const response = await suggestGET(
            new Request(
              `http://app.invalid/api/catalog/suggest?market=${marketId}&q=${marker}`,
            ),
          );
          expect(response.headers.get("cache-control")).toBe(
            "private, no-store",
          );
          expect(
            ((await response.json()) as { items: { id: string }[] }).items.some(
              (p) => p.id === productId,
            ),
          ).toBe(expected);
        };
        const a = await customer("0"),
          b = await customer("0");
        const context = { marketId, locale: "en" };
        try {
          await configure({ enabled: true, coinSalesEnabled: true });
          await visible(true);
          state.customer = a.id;
          expect((await mergeWishlist(context, [productId])).ids).toContain(
            productId,
          );
          expect(
            (await publicCards(context, [productId])).map((p) => p.id),
          ).toEqual([productId]);
          await configure(toggles);
          await visible(false);
          // Previously saved IDs stay durable, while both wishlist and recent
          // cards omit the now-hidden product and its price.
          const saved = await wishlist(context);
          expect(saved.ids).toContain(productId);
          expect(await publicCards(context, saved.ids)).toEqual([]);
          expect(await publicCards(context, [productId])).toEqual([]);
          state.customer = b.id;
          expect((await mergeWishlist(context, [productId])).ids).not.toContain(
            productId,
          );
          expect(
            await db.wishlist.count({ where: { customerId: b.id, productId } }),
          ).toBe(0);
          await configure({ enabled: true, coinSalesEnabled: true });
          await visible(true);
          expect((await mergeWishlist(context, [productId])).ids).toContain(
            productId,
          );
          state.customer = a.id;
          expect(
            (await publicCards(context, (await wishlist(context)).ids)).map(
              (p) => p.id,
            ),
          ).toEqual([productId]);
        } finally {
          state.customer = null;
          await db.product.update({
            where: { id: productId },
            data: { status: "ARCHIVED" },
          });
        }
      },
    );
    it.each(["DRAFT", "ARCHIVED", "COIN_PACK"] as const)(
      "rejects a prepared look when its previously active garment becomes %s",
      async (state) => {
        const original = await db.product.findUniqueOrThrow({
          where: { id: "seed-style-v2-women-tee" },
        });
        const blocks = homepageBlocksSchema.parse([styleLookBlock]);
        await validateLookReferences(blocks, marketId);
        try {
          await db.product.update({
            where: { id: original.id },
            data:
              state === "COIN_PACK"
                ? { coinPackCoins: "100" }
                : { status: state },
          });
          await expect(
            validateLookReferences(blocks, marketId),
          ).rejects.toThrow();
        } finally {
          await db.product.update({
            where: { id: original.id },
            data: {
              status: original.status,
              coinPackCoins: original.coinPackCoins,
            },
          });
        }
      },
    );
    it("rejects a crafted child department without changing homepage content", async () => {
      state.actor = ownerId;
      const blocks = homepageBlocksSchema.parse([styleLookBlock]);
      const block = blocks[0];
      if (block.type !== "ShopLook") throw new Error("Missing shop look");
      const child = await db.category.findFirstOrThrow({
        where: { parentId: block.looks[0].categoryId, deletedAt: null },
      });
      block.looks[0].categoryId = child.id;
      const before = await db.homepage.findFirst({
        where: { marketId, deletedAt: null },
      });
      const audits = await db.auditLog.count({
        where: { action: { startsWith: "content.homepage." } },
      });
      const form = new FormData();
      form.set("marketId", marketId);
      form.set("blocks", JSON.stringify(blocks));
      expect(await saveHomepage(null, form)).toMatchObject({
        ok: false,
        code: "VALIDATION",
      });
      expect(
        await db.homepage.findFirst({
          where: { marketId, deletedAt: null },
        }),
      ).toEqual(before);
      expect(
        await db.auditLog.count({
          where: { action: { startsWith: "content.homepage." } },
        }),
      ).toBe(audits);
    });
    it.each([
      "PRODUCT",
      "CATEGORY",
      "CATEGORY_PARENT",
      "COLOR",
      "MEDIA_DELETE",
      "MEDIA_STATUS",
    ] as const)(
      "rejects homepage references invalidated by a concurrent %s transaction",
      async (kind) => {
        state.actor = ownerId;
        const blocks = homepageBlocksSchema.parse([styleLookBlock]);
        const block = blocks[0];
        if (block.type !== "ShopLook") throw new Error("Missing shop look");
        const look = block.looks[0];
        const productId = look.items[0].productId;
        const categoryId = look.categoryId;
        const colorId = look.items[0].colorId;
        const mediaId = look.mediaId;
        const before = await db.homepage.findFirst({
          where: { marketId, deletedAt: null },
        });
        const audits = await db.auditLog.count({
          where: { action: { startsWith: "content.homepage." } },
        });
        const originalProduct = await db.product.findUniqueOrThrow({
          where: { id: productId },
        });
        const originalCategory = await db.category.findUniqueOrThrow({
          where: { id: categoryId },
        });
        const originalColor = await db.color.findUniqueOrThrow({
          where: { id: colorId },
        });
        const originalMedia = await db.media.findUniqueOrThrow({
          where: { id: mediaId },
        });
        let ready!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let writerPid = 0;
        const invalidator = db.$transaction(
          async (tx) => {
            const [backend] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            writerPid = backend.pid;
            if (kind === "PRODUCT")
              await tx.product.update({
                where: { id: productId },
                data: { status: "ARCHIVED" },
              });
            else if (kind === "CATEGORY")
              await tx.category.update({
                where: { id: categoryId },
                data: { deletedAt: new Date() },
              });
            else if (kind === "CATEGORY_PARENT")
              await tx.category.update({
                where: { id: categoryId },
                data: { parentId: "seed-category-men" },
              });
            else if (kind === "COLOR")
              await tx.color.update({
                where: { id: colorId },
                data: { deletedAt: new Date() },
              });
            else
              await tx.media.update({
                where: { id: mediaId },
                data:
                  kind === "MEDIA_DELETE"
                    ? { deletedAt: new Date() }
                    : { status: "FAILED" },
              });
            ready();
            await gate;
          },
          { timeout: 15000 },
        );
        await Promise.race([entered, invalidator]);
        const form = new FormData();
        form.set("marketId", marketId);
        form.set("blocks", JSON.stringify(blocks));
        const save = saveHomepage(null, form);
        try {
          let blocked = false;
          for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
            const [current] = await db.$queryRaw<{ blocked: boolean }[]>`
              SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                WHERE ${writerPid} = ANY(pg_blocking_pids(pid))) AS blocked
            `;
            blocked = current.blocked;
            if (!blocked)
              await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          release();
          await invalidator;
          expect(await save).toMatchObject({ ok: false, code: "VALIDATION" });
          expect(
            await db.homepage.findFirst({
              where: { marketId, deletedAt: null },
            }),
          ).toEqual(before);
          expect(
            await db.auditLog.count({
              where: { action: { startsWith: "content.homepage." } },
            }),
          ).toBe(audits);
        } finally {
          release();
          await Promise.allSettled([invalidator, save]);
          if (kind === "PRODUCT")
            await db.product.update({
              where: { id: productId },
              data: { status: originalProduct.status },
            });
          else if (kind === "CATEGORY")
            await db.category.update({
              where: { id: categoryId },
              data: { deletedAt: originalCategory.deletedAt },
            });
          else if (kind === "CATEGORY_PARENT")
            await db.category.update({
              where: { id: categoryId },
              data: { parentId: originalCategory.parentId },
            });
          else if (kind === "COLOR")
            await db.color.update({
              where: { id: colorId },
              data: { deletedAt: originalColor.deletedAt },
            });
          else
            await db.media.update({
              where: { id: mediaId },
              data: {
                deletedAt: originalMedia.deletedAt,
                status: originalMedia.status,
              },
            });
        }
      },
    );
    it.each(["DELETE", "STATUS"] as const)(
      "rejects fitting settings after concurrent model-image %s",
      async (kind) => {
        state.actor = ownerId;
        const originalMedia = await db.media.findUniqueOrThrow({
          where: { id: defaultConfig.models[0].mediaId },
        });
        const originalIntegration = await db.integration.findUniqueOrThrow({
          where: { key: "fitting-room" },
        });
        let ready!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let writerPid = 0;
        const invalidator = db.$transaction(
          async (tx) => {
            const [backend] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            writerPid = backend.pid;
            await tx.media.update({
              where: { id: originalMedia.id },
              data:
                kind === "DELETE"
                  ? { deletedAt: new Date() }
                  : { status: "FAILED" },
            });
            ready();
            await gate;
          },
          { timeout: 15000 },
        );
        await Promise.race([entered, invalidator]);
        const save = saveFittingSettings({
          config: { ...defaultConfig, costCoins: "15" },
          version: originalIntegration.updatedAt.toISOString(),
          confirm: true,
        }).then(
          () => null,
          (error: unknown) => error,
        );
        try {
          let blocked = false;
          for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
            const [current] = await db.$queryRaw<{ blocked: boolean }[]>`
              SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                WHERE ${writerPid} = ANY(pg_blocking_pids(pid))) AS blocked
            `;
            blocked = current.blocked;
            if (!blocked)
              await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
          release();
          await invalidator;
          expect(await save).toMatchObject({ message: "INVALID_SELECTION" });
          expect(
            await db.integration.findUniqueOrThrow({
              where: { id: originalIntegration.id },
            }),
          ).toEqual(originalIntegration);
        } finally {
          release();
          await Promise.allSettled([invalidator, save]);
          await db.media.update({
            where: { id: originalMedia.id },
            data: {
              deletedAt: originalMedia.deletedAt,
              status: originalMedia.status,
            },
          });
        }
      },
    );
    it.each(["seed-fitting-pack-100", "seed-style-v2-women-tee"])(
      "preserves fitting metadata when the admin duplicates %s",
      async (sourceId) => {
        state.actor = ownerId;
        const source = await db.product.findUniqueOrThrow({
          where: { id: sourceId },
          include: { variants: true },
        });
        const form = new FormData();
        form.set("id", sourceId);
        expect(await duplicateProduct(null, form)).toEqual({ ok: true });
        const audit = await db.auditLog.findFirstOrThrow({
          where: {
            action: "catalog.product.duplicate",
            before: { path: ["sourceId"], equals: sourceId },
          },
          orderBy: { createdAt: "desc" },
        });
        const copy = await db.product.findUniqueOrThrow({
          where: { id: audit.entityId! },
          include: { variants: true },
        });
        expect(copy.id).not.toBe(source.id);
        expect(copy.status).toBe("DRAFT");
        expect(copy.fittingSlot).toBe(source.fittingSlot);
        expect(copy.coinPackCoins?.toString() ?? null).toBe(
          source.coinPackCoins?.toString() ?? null,
        );
        expect(copy.variants).toHaveLength(source.variants.length);
      },
    );
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
    it("defers new jobs during maintenance and completes admitted rendering without redispatch", async () => {
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
        state.maintenance = true;
        await runJobs(["fitting-render"]);
        const deferred = await db.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(deferred.status).toBe("PENDING");
        expect(deferred.attempts).toBe(0);
        expect(provider.render).not.toHaveBeenCalled();
        state.maintenance = false;
        await db.job.update({
          where: { id: job.id },
          data: { runAt: new Date(0) },
        });
        await runJobs(["fitting-render"]);
        const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(fresh.status).toBe("DONE");
        expect(fresh.attempts).toBe(0);
        expect(state.maintenance).toBe(true);
        expect((await sessionView(c.id, s.id)).status).toBe("DONE");
        state.maintenance = false;
        await runJobs(["fitting-render"]);
        expect(
          (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
        ).toBe("DONE");
        expect((await sessionView(c.id, s.id)).status).toBe("DONE");
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
    it.each(["QUEUED", "DONE"] as const)(
      "recovers an existing %s session after the feature is disabled",
      async (status) => {
        const c = await customer(),
          request = input(),
          session = await createFittingSession(c.id, marketId, "en", request),
          provider = { render: vi.fn(async () => bytes) };
        if (status === "DONE") {
          await renderFitting(session.id, provider);
          outputKeys.push(
            (
              await db.fittingSession.findUniqueOrThrow({
                where: { id: session.id },
              })
            ).storageKey!,
          );
        }
        await configure({ enabled: false, costCoins: "25", models: [] });
        expect(
          await createFittingSession(c.id, marketId, "en", request),
        ).toEqual({
          id: session.id,
          status,
        });
        await expect(
          createFittingSession(c.id, marketId, "en", {
            ...request,
            modelId: "other",
          }),
        ).rejects.toThrow("REQUEST_CONFLICT");
        await expect(
          createFittingSession(c.id, marketId, "en", {
            ...request,
            requestKey: randomUUID(),
          }),
        ).rejects.toThrow("DISABLED");
        expect(await balance(c.id)).toBe("87.5");
        expect(
          await db.fittingSession.count({ where: { customerId: c.id } }),
        ).toBe(1);
        expect(
          await db.fittingCoinEntry.count({
            where: { customerId: c.id, reason: "FITTING" },
          }),
        ).toBe(1);
        expect(provider.render).toHaveBeenCalledTimes(
          status === "DONE" ? 1 : 0,
        );
      },
    );
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
    it("keeps refunded failures in the store request budget but restores customer usage", async () => {
      const day = dayBounds(new Date(), defaultConfig.timezone);
      const base = await db.fittingSession.count({
        where: { createdAt: { gte: day.start, lt: day.end } },
      });
      await configure({ dailyLimit: 1, globalDailyLimit: base + 1 });
      const c = await customer();
      const session = await create(c.id);
      await renderFitting(session.id, {
        render: async () => {
          throw new ProviderFailure(true);
        },
      });
      expect(await balance(c.id)).toBe("100");
      await expect(create(c.id)).rejects.toThrow("DAILY_LIMIT");
      expect(await balance(c.id)).toBe("100");
      await configure({ dailyLimit: 1, globalDailyLimit: base + 2 });
      await create(c.id);
      expect(await balance(c.id)).toBe("87.5");
    });
    it("refunds a real adapter reference-read error without remote dispatch", async () => {
      const c = await customer(),
        session = await create(c.id);
      const read = vi
        .spyOn(storage, "getBytes")
        .mockRejectedValueOnce(new Error("fixture reference read failure"));
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      try {
        await renderFitting(session.id);
        await renderFitting(session.id);
        expect(fetcher).not.toHaveBeenCalled();
        expect((await sessionView(c.id, session.id)).status).toBe("FAILED");
        expect(await balance(c.id)).toBe("100");
        expect(
          await db.fittingCoinEntry.count({
            where: { customerId: c.id, sourceKey: `refund:${session.id}` },
          }),
        ).toBe(1);
      } finally {
        read.mockRestore();
        vi.unstubAllGlobals();
      }
    });
    it.each(unusableFittingResponses)(
      "refunds adapter $name exactly once without a second dispatch",
      async ({ response }) => {
        const c = await customer(),
          session = await create(c.id);
        const read = vi
          .spyOn(storage, "getBytes")
          .mockResolvedValue(Buffer.from(bytes));
        const fetcher = vi.fn(async () => response());
        vi.stubGlobal("fetch", fetcher);
        try {
          await renderFitting(session.id);
          await renderFitting(session.id);
          expect(fetcher).toHaveBeenCalledTimes(1);
          expect((await sessionView(c.id, session.id)).status).toBe("FAILED");
          expect(await balance(c.id)).toBe("100");
          expect(
            await db.fittingCoinEntry.count({
              where: { customerId: c.id, sourceKey: `refund:${session.id}` },
            }),
          ).toBe(1);
        } finally {
          read.mockRestore();
          vi.unstubAllGlobals();
        }
      },
    );
    it.each(["success", "definite", "unknown", "delivery"] as const)(
      "keeps the restore drain active through provider and %s settlement",
      async (outcome) => {
        const c = await customer(),
          session = await create(c.id);
        let entered!: () => void, release!: () => void;
        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const blocked = new Promise<void>((resolve) => {
          release = resolve;
        });
        const provider = {
          render: vi.fn(async () => {
            entered();
            await blocked;
            if (outcome === "definite") throw new ProviderFailure(true);
            if (outcome === "unknown") throw new ProviderFailure(false);
            return bytes;
          }),
        };
        const failedUpload =
          outcome === "delivery"
            ? vi
                .spyOn(storage, "put")
                .mockRejectedValue(new Error("fixture upload failure"))
            : null;
        expect(inFlightCount()).toBe(0);
        const rendering = renderFitting(session.id, provider);
        try {
          await Promise.race([started, rendering]);
          expect(provider.render).toHaveBeenCalledTimes(1);
          expect(inFlightCount()).toBe(1);
          state.maintenance = true;
          await expect(
            renderFitting(session.id, provider),
          ).rejects.toBeInstanceOf(MaintenanceError);
          expect(inFlightCount()).toBe(1);
          expect(provider.render).toHaveBeenCalledTimes(1);
          release();
          await rendering;
          const result = await db.fittingSession.findUniqueOrThrow({
            where: { id: session.id },
          });
          expect(result.status).toBe(
            outcome === "success"
              ? "DONE"
              : outcome === "unknown"
                ? "REVIEW"
                : "FAILED",
          );
          expect(inFlightCount()).toBe(0);
          if (outcome === "success") {
            outputKeys.push(result.storageKey!);
            expect(await storage.getBytes(result.storageKey!)).not.toBeNull();
          }
          if (outcome === "delivery")
            expect(
              await db.job.count({
                where: {
                  type: "fitting-output-purge",
                  payload: { path: ["sessionId"], equals: session.id },
                },
              }),
            ).toBe(1);
          expect(
            await db.fittingCoinEntry.count({
              where: { customerId: c.id, sourceKey: `refund:${session.id}` },
            }),
          ).toBe(["definite", "delivery"].includes(outcome) ? 1 : 0);
          state.maintenance = false;
          expect(await balance(c.id)).toBe(
            ["definite", "delivery"].includes(outcome) ? "100" : "87.5",
          );
        } finally {
          release();
          await Promise.allSettled([rendering]);
          state.maintenance = false;
          failedUpload?.mockRestore();
        }
      },
    );
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
        const originalPut = storage.put.bind(storage);
        const put =
          failure === "storage"
            ? vi
                .spyOn(storage, "put")
                .mockImplementation(
                  async (
                    key: string,
                    data: Buffer,
                    mime = "application/octet-stream",
                  ) => {
                    await originalPut(key, data, mime);
                    throw new Error("fixture upload acknowledgement lost");
                  },
                )
            : null;
        if (failure === "encryption") process.env.AUTH_SECRET = "";
        try {
          await renderFitting(s.id, provider);
          await renderFitting(s.id, provider);
          expect(provider.render).toHaveBeenCalledTimes(1);
          expect((await sessionView(c.id, s.id)).status).toBe("FAILED");
          expect(await balance(c.id)).toBe("100");
          if (failure === "storage") {
            const session = await db.fittingSession.findUniqueOrThrow({
              where: { id: s.id },
            });
            expect(session.storageKey).toBeTruthy();
            expect(await storage.getBytes(session.storageKey!)).not.toBeNull();
            const job = await db.job.findFirstOrThrow({
              where: {
                type: "fitting-output-purge",
                payload: { path: ["sessionId"], equals: s.id },
              },
            });
            const originalDelete = storage.delete.bind(storage);
            let failed = false;
            const remove = vi
              .spyOn(storage, "delete")
              .mockImplementation(async (key) => {
                if (key === session.storageKey && !failed) {
                  failed = true;
                  throw new Error("fixture transient cleanup failure");
                }
                return originalDelete(key);
              });
            try {
              await runJobs(["fitting-output-purge"]);
              const retry = await db.job.findUniqueOrThrow({
                where: { id: job.id },
              });
              expect(retry.status).toBe("PENDING");
              expect(retry.attempts).toBe(1);
              expect((retry.payload as { storageKey: string }).storageKey).toBe(
                session.storageKey,
              );
            } finally {
              remove.mockRestore();
            }
            await db.job.update({
              where: { id: job.id },
              data: { runAt: new Date(0) },
            });
            await runJobs(["fitting-output-purge"]);
            expect(
              (await db.job.findUniqueOrThrow({ where: { id: job.id } }))
                .status,
            ).toBe("DONE");
            expect(await storage.getBytes(session.storageKey!)).toBeNull();
          }

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
    it("refunds an abandoned known output and retains durable cleanup identity", async () => {
      const c = await customer(),
        session = await create(c.id);
      const key = `fitting/2026/${randomUUID()}.sealed`;
      await db.fittingSession.update({
        where: { id: session.id },
        data: {
          status: "RUNNING",
          storageKey: key,
          startedAt: new Date(Date.now() - 6 * 60000),
        },
      });
      const provider = { render: vi.fn(async () => bytes) };
      await renderFitting(session.id, provider);
      expect(provider.render).not.toHaveBeenCalled();
      expect((await sessionView(c.id, session.id)).status).toBe("FAILED");
      expect(await balance(c.id)).toBe("100");
      expect(
        (
          await db.job.findFirstOrThrow({
            where: {
              type: "fitting-output-purge",
              payload: { path: ["sessionId"], equals: session.id },
            },
          })
        ).payload,
      ).toEqual({ sessionId: session.id, storageKey: key });
    });
    it.each(["DONE", "RUNNING"] as const)(
      "cleans a late upload after the previous deletion is %s without another render or refund",
      async (previousState) => {
        const c = await customer(),
          session = await create(c.id);
        const provider = { render: vi.fn(async () => bytes) };
        const originalPut = storage.put.bind(storage);
        const originalDelete = storage.delete.bind(storage);
        let putReady!: () => void, releasePut!: () => void;
        let deleteReady!: () => void, releaseDelete!: () => void;
        const putEntered = new Promise<void>((resolve) => {
          putReady = resolve;
        });
        const putGate = new Promise<void>((resolve) => {
          releasePut = resolve;
        });
        const deleteEntered = new Promise<void>((resolve) => {
          deleteReady = resolve;
        });
        const deleteGate = new Promise<void>((resolve) => {
          releaseDelete = resolve;
        });
        let key = "",
          heldDelete = false;
        const put = vi
          .spyOn(storage, "put")
          .mockImplementation(async (...args) => {
            key = args[0];
            outputKeys.push(key);
            putReady();
            await putGate;
            return originalPut(
              args[0],
              args[1],
              args[2] ?? "application/octet-stream",
            );
          });
        const remove = vi
          .spyOn(storage, "delete")
          .mockImplementation(async (objectKey) => {
            await originalDelete(objectKey);
            if (
              objectKey === key &&
              previousState === "RUNNING" &&
              !heldDelete
            ) {
              heldDelete = true;
              deleteReady();
              await deleteGate;
            }
          });
        const original = renderFitting(session.id, provider);
        let purge: Promise<number> | undefined;
        try {
          await Promise.race([putEntered, original]);
          expect(key).toMatch(/^fitting\//);
          await db.fittingSession.update({
            where: { id: session.id },
            data: { startedAt: new Date(0) },
          });
          await renderFitting(session.id, provider);
          const first = await db.job.findFirstOrThrow({
            where: {
              type: "fitting-output-purge",
              payload: { path: ["sessionId"], equals: session.id },
            },
          });
          purge = runJobs(["fitting-output-purge"]);
          if (previousState === "RUNNING")
            await Promise.race([deleteEntered, purge]);
          else await purge;
          expect(
            (await db.job.findUniqueOrThrow({ where: { id: first.id } }))
              .status,
          ).toBe(previousState);
          releasePut();
          await original;
          expect(await storage.getBytes(key)).not.toBeNull();
          const jobs = await db.job.findMany({
            where: {
              type: "fitting-output-purge",
              payload: { path: ["sessionId"], equals: session.id },
            },
          });
          expect(jobs).toHaveLength(2);
          expect(jobs.find((j) => j.id !== first.id)?.status).toBe("PENDING");
          releaseDelete();
          await purge;
          await runJobs(["fitting-output-purge"]);
          expect(await storage.getBytes(key)).toBeNull();
          expect(
            await db.job.count({
              where: { id: { in: jobs.map((j) => j.id) }, status: "DONE" },
            }),
          ).toBe(2);
          expect(provider.render).toHaveBeenCalledTimes(1);
          expect(await balance(c.id)).toBe("100");
          expect(
            await db.fittingCoinEntry.count({
              where: { customerId: c.id, sourceKey: `refund:${session.id}` },
            }),
          ).toBe(1);
        } finally {
          releasePut();
          releaseDelete();
          await Promise.allSettled([original, ...(purge ? [purge] : [])]);
          put.mockRestore();
          remove.mockRestore();
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
          marketId,
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
    it("filters the review queue and authorizes refunds against the locked session market", async () => {
      const other = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const a = await customer(),
        b = await customer();
      const first = await create(a.id);
      const second = await createFittingSession(b.id, other.id, "en", input());
      const provider = {
        render: vi.fn(async () => {
          throw new ProviderFailure(false);
        }),
      };
      await renderFitting(first.id, provider);
      await renderFitting(second.id, provider);
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: ownerId,
          permission: "ai.settings.manage",
          allow: false,
          scope: { marketId: other.id },
        },
      });
      try {
        const review = (await fittingSettings()).review;
        expect(review.some((s) => s.id === first.id)).toBe(true);
        expect(review.some((s) => s.id === second.id)).toBe(false);
        await expect(
          resolveFittingSession({ id: second.id, confirm: true, refund: true }),
        ).rejects.toThrow("FORBIDDEN");
        expect((await sessionView(b.id, second.id)).status).toBe("REVIEW");
        expect(await balance(b.id)).toBe("87.5");
        expect(
          await db.auditLog.count({
            where: { action: "fitting.session.refund", entityId: second.id },
          }),
        ).toBe(0);
        expect(
          await db.fittingCoinEntry.count({
            where: { customerId: b.id, sourceKey: `refund:${second.id}` },
          }),
        ).toBe(0);
        await resolveFittingSession({
          id: first.id,
          confirm: true,
          refund: true,
        });
        expect(await balance(a.id)).toBe("100");
      } finally {
        await db.userPermissionOverride.delete({ where: { id: deny.id } });
      }
      expect(
        (await fittingSettings()).review.some((s) => s.id === second.id),
      ).toBe(true);
      await resolveFittingSession({
        id: second.id,
        confirm: true,
        refund: true,
      });
      expect(await balance(b.id)).toBe("100");
    });
    it.each(["ADD", "CHANGE", "REMOVE"] as const)(
      "requires market-scoped permission to %s a purchase reward despite global allow",
      async (operation) => {
        const ca = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
        const trReward = { marketId, spendAmount: "100", coins: "25" };
        const caReward = { marketId: ca.id, spendAmount: "100", coins: "25" };
        const config = await configure({
          enabled: false,
          rewards: operation === "ADD" ? [trReward] : [trReward, caReward],
        });
        const deny = await db.userPermissionOverride.create({
          data: {
            userId: ownerId,
            permission: "ai.settings.manage",
            allow: false,
            scope: { marketId: ca.id },
          },
        });
        try {
          const before = await db.integration.findUniqueOrThrow({
            where: { key: "fitting-room" },
          });
          const audits = await db.auditLog.count({
            where: { action: "fitting.settings.save" },
          });
          const rewards =
            operation === "REMOVE"
              ? [trReward]
              : [
                  trReward,
                  { ...caReward, coins: operation === "CHANGE" ? "50" : "25" },
                ];
          await expect(
            saveFittingSettings({
              version: before.updatedAt.toISOString(),
              config: { ...config, rewards },
              confirm: true,
            }),
          ).rejects.toThrow("FORBIDDEN");
          expect(
            await db.integration.findUniqueOrThrow({
              where: { key: "fitting-room" },
            }),
          ).toEqual(before);
          expect(
            await db.auditLog.count({
              where: { action: "fitting.settings.save" },
            }),
          ).toBe(audits);
          await saveFittingSettings({
            version: before.updatedAt.toISOString(),
            config: {
              ...config,
              costCoins: "13.5",
              rewards: config.rewards
                .map((r) =>
                  r.marketId === marketId
                    ? { ...r, spendAmount: "200" }
                    : { ...r, spendAmount: "100.0000", coins: "25.0000" },
                )
                .reverse(),
            },
            confirm: true,
          });
          expect(
            (await fittingSettings()).config.rewards.find(
              (r) => r.marketId === marketId,
            )?.spendAmount,
          ).toBe("200");
        } finally {
          await db.userPermissionOverride.delete({ where: { id: deny.id } });
        }
      },
    );
    it("credits the supported 1000-person audience atomically with debt offsets and replay", async () => {
      const ids = Array.from({ length: 1000 }, () => randomUUID());
      customers.push(...ids);
      await db.customer.createMany({
        data: ids.map((id) => ({
          id,
          email: `batch-${id}@example.com`,
          isGuest: false,
          preferredMarketId: marketId,
        })),
      });
      await db.fittingWallet.createMany({
        data: ids.map((customerId, i) => ({
          id: customerId,
          customerId,
          debt: i % 3 === 0 ? "5.0001" : "0",
        })),
      });
      await db.fittingCoinDebtOverflow.createMany({
        data: ids.flatMap((customerId, i) =>
          i % 3 === 1
            ? [
                {
                  customerId,
                  sourceKey: "fixture-debt",
                  amount: "5",
                  balance: "3.5",
                },
              ]
            : [],
        ),
      });
      const request = {
        marketId,
        requestKey: randomUUID(),
        customerIds: ids,
        amount: "12.5001",
        expiresAt: null,
        reason: "batch fixture",
        confirm: true,
      };
      await grantFittingCoins(request);
      await grantFittingCoins(request);
      const grants = await db.fittingCoinGrant.findMany({
        where: {
          customerId: { in: ids },
          sourceKey: `manual:${request.requestKey}`,
        },
      });
      expect(grants).toHaveLength(1000);
      const byId = new Map(grants.map((g) => [g.customerId, g]));
      for (const [i, id] of ids.entries()) {
        expect(byId.get(id)?.amount.toString()).toBe("12.5001");
        expect(byId.get(id)?.balance.toString()).toBe(
          i % 3 === 0 ? "7.5" : i % 3 === 1 ? "9.0001" : "12.5001",
        );
      }
      expect(
        await db.fittingWallet.count({
          where: { customerId: { in: ids }, debt: { gt: 0 } },
        }),
      ).toBe(0);
      expect(
        await db.fittingCoinDebtOverflow.count({
          where: { customerId: { in: ids }, balance: { gt: 0 } },
        }),
      ).toBe(0);
      expect(
        await db.fittingCoinEntry.count({
          where: {
            customerId: { in: ids },
            sourceKey: `grant:manual:${request.requestKey}`,
          },
        }),
      ).toBe(1000);
      expect(
        await db.auditLog.count({
          where: {
            action: "fitting.coins.grant",
            entityId: request.requestKey,
          },
        }),
      ).toBe(1);
    });
    it("keeps overflow liability identities immutable while permitting repayment", async () => {
      const a = await customer("0"),
        b = await customer("0");
      const lot = await db.fittingCoinDebtOverflow.create({
        data: {
          customerId: a.id,
          sourceKey: "immutable-fixture",
          amount: "5.0001",
          balance: "5.0001",
        },
      });
      for (const data of [
        { id: randomUUID() },
        { customerId: b.id },
        { sourceKey: "changed" },
        { amount: "6" },
        { createdAt: new Date("2000-01-01T00:00:00Z") },
      ])
        await expect(
          db.fittingCoinDebtOverflow.update({ where: { id: lot.id }, data }),
        ).rejects.toThrow("Fitting debt identity is immutable");
      await expect(
        db.fittingCoinDebtOverflow.delete({ where: { id: lot.id } }),
      ).rejects.toThrow("Fitting debt identity is immutable");
      const paid = await db.fittingCoinDebtOverflow.update({
        where: { id: lot.id },
        data: { balance: "4.0001" },
      });
      expect(paid.amount.toString()).toBe("5.0001");
      expect(paid.balance.toString()).toBe("4.0001");
      expect(paid.createdAt).toEqual(lot.createdAt);
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
        marketId,
        requestKey: randomUUID(),
        customerIds: [a.id, b.id],
        amount: "12.5001",
        expiresAt: null,
        reason: "loyalty",
        confirm: true,
      };
      await db.customer.updateMany({
        where: { id: { in: [a.id, b.id] } },
        data: { preferredMarketId: marketId },
      });
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
    it("scopes recipient search and direct grants despite a global allow and scoped deny", async () => {
      const other = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const a = await customer("0"),
        b = await customer("0"),
        cartMember = await customer("0");
      const marker = `scope-fit-${randomUUID()}`;
      await db.customer.update({
        where: { id: a.id },
        data: { preferredMarketId: marketId, firstName: marker },
      });
      await db.customer.update({
        where: { id: b.id },
        data: { preferredMarketId: other.id, firstName: marker },
      });
      await db.customer.update({
        where: { id: cartMember.id },
        data: { firstName: marker },
      });
      await db.cart.create({
        data: {
          tokenHash: randomUUID(),
          customerId: cartMember.id,
          marketId,
          locale: "en",
          currency: "TRY",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: ownerId,
          permission: "crm.customer.view",
          allow: false,
          scope: { marketId: other.id },
        },
      });
      const request = {
        marketId,
        requestKey: randomUUID(),
        customerIds: [a.id, cartMember.id],
        amount: "12.5",
        expiresAt: null,
        reason: "scoped fixture",
        confirm: true,
      };
      try {
        expect(
          (await fittingRecipientMarkets()).some((m) => m.id === other.id),
        ).toBe(false);
        expect(
          (await fittingRecipients(marketId, marker)).map((c) => c.id).sort(),
        ).toEqual([a.id, cartMember.id].sort());
        await expect(fittingRecipients(other.id, marker)).rejects.toThrow(
          "FORBIDDEN",
        );
        await expect(
          grantFittingCoins({
            ...request,
            marketId: other.id,
            customerIds: [b.id],
          }),
        ).rejects.toThrow("FORBIDDEN");
        await expect(
          grantFittingCoins({ ...request, customerIds: [a.id, b.id] }),
        ).rejects.toThrow("INVALID_SELECTION");
        expect(
          await db.fittingCoinGrant.count({
            where: { customerId: { in: [a.id, b.id, cartMember.id] } },
          }),
        ).toBe(0);
        await grantFittingCoins(request);
        expect(await balance(a.id)).toBe("12.5");
        expect(await balance(cartMember.id)).toBe("12.5");
        expect(await balance(b.id)).toBe("0");
      } finally {
        await db.userPermissionOverride.delete({ where: { id: deny.id } });
      }
    });
    it("requires segment and customer membership in the same explicitly authorized market", async () => {
      const other = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const a = await customer("0"),
        b = await customer("0"),
        marker = `fit-group-${randomUUID()}`;
      await db.customer.update({
        where: { id: a.id },
        data: { preferredMarketId: marketId },
      });
      await db.customer.update({
        where: { id: b.id },
        data: { preferredMarketId: other.id },
      });
      await db.crmProfile.createMany({
        data: [a, b].map((c) => ({
          customerId: c.id,
          marketId,
          tags: [marker],
        })),
      });
      const definition = {
        version: 1,
        rules: [{ field: "tag", value: marker }],
      };
      const segment = await db.crmSegment.create({
        data: { name: marker, marketId, definition },
      });
      const foreign = await db.crmSegment.create({
        data: { name: marker, marketId: other.id, definition },
      });
      const request = {
        marketId,
        requestKey: randomUUID(),
        customerIds: [],
        segmentId: segment.id,
        amount: "12.5",
        expiresAt: null,
        reason: "scoped segment fixture",
        confirm: true,
      };
      await expect(
        grantFittingCoins({ ...request, segmentId: foreign.id }),
      ).rejects.toThrow("INVALID_SELECTION");
      await grantFittingCoins(request);
      await grantFittingCoins(request);
      expect(await balance(a.id)).toBe("12.5");
      expect(await balance(b.id)).toBe("0");
    });
    it("binds an idempotent manual grant request to its authorized market", async () => {
      const other = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const c = await customer("0");
      await db.customer.update({
        where: { id: c.id },
        data: { preferredMarketId: marketId },
      });
      await db.cart.create({
        data: {
          tokenHash: randomUUID(),
          customerId: c.id,
          marketId: other.id,
          locale: "en",
          currency: other.currency,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const request = {
        marketId,
        requestKey: randomUUID(),
        customerIds: [c.id],
        amount: "12.5",
        expiresAt: null,
        reason: "market-bound replay",
        confirm: true,
      };
      await grantFittingCoins(request);
      await expect(
        grantFittingCoins({ ...request, marketId: other.id }),
      ).rejects.toThrow("REQUEST_CONFLICT");
      expect(await balance(c.id)).toBe("12.5");
    });
    it("replays a segment grant against its submitted request after the audience changes", async () => {
      const a = await customer("0"),
        b = await customer("0"),
        marker = `replay-group-${randomUUID()}`;
      await db.customer.updateMany({
        where: { id: { in: [a.id, b.id] } },
        data: { preferredMarketId: marketId },
      });
      await db.crmProfile.createMany({
        data: [a, b].map((c) => ({
          customerId: c.id,
          marketId,
          tags: c.id === a.id ? [marker] : [],
        })),
      });
      const segment = await db.crmSegment.create({
        data: {
          name: marker,
          marketId,
          definition: { version: 1, rules: [{ field: "tag", value: marker }] },
        },
      });
      const request = {
        marketId,
        requestKey: randomUUID(),
        customerIds: [],
        segmentId: segment.id,
        amount: "12.5",
        expiresAt: null,
        reason: "stable request fixture",
        confirm: true,
      };
      await grantFittingCoins(request);
      await db.crmProfile.updateMany({
        where: { customerId: a.id, marketId },
        data: { tags: [] },
      });
      await db.crmProfile.updateMany({
        where: { customerId: b.id, marketId },
        data: { tags: [marker] },
      });
      await Promise.all([
        grantFittingCoins(request),
        grantFittingCoins(request),
      ]);
      const evidence = await db.auditLog.findMany({
        where: { action: "fitting.coins.grant", entityId: request.requestKey },
      });
      expect(evidence).toHaveLength(1);
      expect(evidence[0].after).toMatchObject({
        customerIds: [a.id],
        request: { customerIds: [], segmentId: segment.id, marketId },
        requestFingerprint: expect.any(String),
      });
      await expect(
        grantFittingCoins({ ...request, segmentId: "other" }),
      ).rejects.toThrow("REQUEST_CONFLICT");
      await expect(
        grantFittingCoins({ ...request, customerIds: [b.id] }),
      ).rejects.toThrow("REQUEST_CONFLICT");
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: ownerId,
          permission: "crm.segment.manage",
          allow: false,
          scope: { marketId },
        },
      });
      try {
        await expect(grantFittingCoins(request)).rejects.toThrow("FORBIDDEN");
      } finally {
        await db.userPermissionOverride.delete({ where: { id: deny.id } });
      }
      expect(await balance(a.id)).toBe("12.5");
      expect(await balance(b.id)).toBe("0");
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
    it("batches fitting catalog prices with a single manual-price and FX lookup", async () => {
      const c = await customer();
      const realMany = db.marketPrice.findMany.bind(db.marketPrice),
        realFirst = db.marketPrice.findFirst.bind(db.marketPrice),
        realFx = db.fxOverride.findFirst.bind(db.fxOverride),
        manual = vi.fn(realMany),
        single = vi.fn(realFirst),
        fx = vi.fn(realFx);
      db.marketPrice.findMany = manual as typeof db.marketPrice.findMany;
      db.marketPrice.findFirst = single as typeof db.marketPrice.findFirst;
      db.fxOverride.findFirst = fx as typeof db.fxOverride.findFirst;
      try {
        const products = await fittingProducts(c.id, marketId, "en");
        expect(products.length).toBeGreaterThan(1);
        expect(products.every((p) => p.amount !== null && !p.owned)).toBe(true);
        expect(manual).toHaveBeenCalledTimes(1);
        expect(single).not.toHaveBeenCalled();
        expect(fx).toHaveBeenCalledTimes(1);
      } finally {
        db.marketPrice.findMany = realMany;
        db.marketPrice.findFirst = realFirst;
        db.fxOverride.findFirst = realFx;
      }
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
    it.each(["shipping", "item", "pack"])(
      "uses exact merchandise allocations for %s promotions and reversals",
      async (kind) => {
        await configure({
          rewards: [{ marketId, spendAmount: "100", coins: "25" }],
        });
        const c = await customer("0"),
          f = await returnFixture(db, { customerId: c.id });
        const cart = await db.cart.create({
          data: {
            tokenHash: randomUUID(),
            customerId: c.id,
            marketId,
            currency: f.market.currency,
            locale: "en",
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const two = kind !== "shipping",
          discount = kind === "shipping" ? "10" : "100";
        const order = await db.order.create({
          data: {
            number: `FITTING-${randomUUID()}`,
            marketId,
            customerId: c.id,
            cartId: cart.id,
            guestTokenHash: cart.tokenHash,
            locale: "en",
            currency: f.market.currency,
            status: "DELIVERED",
            paidAt: new Date(),
            deliveredAt: new Date(),
            subtotalAmount: two ? "200" : "100",
            feeTotalAmount: two ? "0" : "10",
            discountAmount: discount,
            totalAmount: "100",
            totalAmountTry: "100",
            totalAmountUsd: "100",
            fxSnapshot: {},
            bankSnapshot: [],
            contactSnapshot: {},
            shippingAddress: {},
            billingAddress: {},
            holdExpiresAt: cart.expiresAt,
            paymentDeadlineAt: cart.expiresAt,
            items: {
              create: (two ? f.variants : [f.variants[0]]).map((v, index) => ({
                variantId: v.id,
                quantity: 1,
                unitPriceAmount: "100",
                lineTotalAmount: "100",
                currency: f.market.currency,
                weightGrams: 100,
                productSnapshot:
                  kind === "pack" && index === 1
                    ? { coinPackCoins: "100" }
                    : {},
              })),
            },
            ...(kind === "shipping"
              ? {
                  fees: {
                    create: {
                      type: "SHIPPING",
                      amount: "10",
                      currency: f.market.currency,
                      absorbed: false,
                      label: "Test shipping",
                      ruleSnapshot: {},
                    },
                  },
                }
              : {}),
            promotionEvaluation: {
              create: {
                requestHash: randomUUID(),
                result: {
                  discountTotal: discount,
                  lines: [
                    {
                      target: kind === "shipping" ? "SHIPPING" : "MERCHANDISE",
                      currency: f.market.currency,
                      amount: discount,
                      allocations:
                        kind === "shipping"
                          ? []
                          : [
                              {
                                variantId:
                                  f.variants[kind === "pack" ? 1 : 0].id,
                                amount: "100",
                              },
                            ],
                    },
                  ],
                },
              },
            },
          },
          include: { items: { orderBy: { variantId: "asc" } } },
        });
        await db.$transaction((tx) => creditPaidOrder(tx, order.id));
        expect(
          (
            await db.fittingCoinGrant.findFirstOrThrow({
              where: { orderId: order.id, reason: "PURCHASE" },
            })
          ).amount.toString(),
        ).toBe("25");
        expect(await balance(c.id)).toBe(kind === "pack" ? "125" : "25");
        const returned = order.items.find(
          (i) => i.variantId === f.variants[kind === "pack" ? 1 : 0].id,
        )!;
        if (kind !== "shipping") {
          await db.returnRequest.create({
            data: {
              orderId: order.id,
              customerId: c.id,
              type: "RETURN",
              reasonCode: "OTHER",
              status: "RESOLVED",
              resolution: "REFUND",
              requestKey: randomUUID(),
              refundAmount: "0",
              items: {
                create: {
                  orderItemId: returned.id,
                  quantity: 1,
                  condition: "RESTOCK",
                  refundAmount: "0",
                },
              },
            },
          });
          await db.$transaction((tx) => revokeReturnedCoins(tx, order.id));
          await db.$transaction((tx) => revokeReturnedCoins(tx, order.id));
          expect(await balance(c.id)).toBe("25");
          if (kind === "item") {
            const paid = order.items.find((i) => i.id !== returned.id)!;
            await db.returnRequest.create({
              data: {
                orderId: order.id,
                customerId: c.id,
                type: "RETURN",
                reasonCode: "OTHER",
                status: "RESOLVED",
                resolution: "REFUND",
                requestKey: randomUUID(),
                refundAmount: "100",
                items: {
                  create: {
                    orderItemId: paid.id,
                    quantity: 1,
                    condition: "RESTOCK",
                    refundAmount: "100",
                  },
                },
              },
            });
            await db.$transaction((tx) => revokeReturnedCoins(tx, order.id));
            expect(await balance(c.id)).toBe("0");
          }
        }
      },
    );
    it.each(["REFUND", "STORE_CREDIT"] as const)(
      "preserves the four-decimal remainder across repeated %s reward reversals",
      async (resolution) => {
        await configure({
          rewards: [{ marketId, spendAmount: "33.3334", coins: "12.5" }],
        });
        const f = await returnFixture(db, {
          customerId: (await customer("0")).id,
          quantity: 3,
          price: "33.3334",
          discount: "0.0002",
        });
        customers.push(f.customer.id);
        await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
        expect(await balance(f.customer.id)).toBe("25");
        let allocated = "0";
        for (let claimed = 0; claimed < 3; claimed++) {
          const amount = returnAmount("100", 3, claimed, allocated, 1);
          expect(amount.toFixed(4)).toBe(claimed === 2 ? "33.3334" : "33.3333");
          allocated = amount.add(allocated).toFixed(4);
          await db.returnRequest.create({
            data: {
              orderId: f.order.id,
              customerId: f.customer.id,
              type: "RETURN",
              reasonCode: "OTHER",
              status: "RESOLVED",
              resolution,
              requestKey: randomUUID(),
              refundAmount: amount.toFixed(),
              items: {
                create: {
                  orderItemId: f.order.items[0].id,
                  quantity: 1,
                  condition: "RESTOCK",
                  refundAmount: amount.toFixed(),
                },
              },
            },
          });
          await db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id));
          await db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id));
          expect(await balance(f.customer.id)).toBe(
            claimed === 2 ? "0" : "12.5",
          );
          expect(
            await db.fittingCoinEntry.count({
              where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
            }),
          ).toBe(claimed === 2 ? 2 : 1);
        }
      },
    );
    it("approves payment with extreme reward settings and reverses the capped entitlement once", async () => {
      await configure({
        rewards: [{ marketId, spendAmount: "0.0001", coins: "9999999999" }],
      });
      const f = await returnFixture(db, {
        customerId: (await customer("0")).id,
        pending: true,
        quantity: 2,
        price: "50",
      });
      customers.push(f.customer.id);
      await db.$transaction((tx) => transition(tx, f.order, "PAID", ownerId));
      const paid = await db.order.findUniqueOrThrow({
        where: { id: f.order.id },
      });
      expect(paid.status).toBe("PAID");
      expect(paid.paidAt).not.toBeNull();
      await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
      expect(await balance(f.customer.id)).toBe("99999999999999.9999");
      const grants = await db.fittingCoinGrant.findMany({
        where: { orderId: f.order.id, reason: "PURCHASE" },
      });
      expect(grants).toHaveLength(1);
      expect(grants[0].ruleSnapshot).toMatchObject({
        maxCoins: "99999999999999.9999",
      });
      for (let returned = 1; returned <= 2; returned++) {
        await db.returnRequest.create({
          data: {
            orderId: f.order.id,
            customerId: f.customer.id,
            type: "RETURN",
            reasonCode: "OTHER",
            status: "RESOLVED",
            resolution: "REFUND",
            requestKey: randomUUID(),
            refundAmount: "50",
            items: {
              create: {
                orderItemId: f.order.items[0].id,
                quantity: 1,
                condition: "RESTOCK",
                refundAmount: "50",
              },
            },
          },
        });
        await db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id));
        await db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id));
        expect(await balance(f.customer.id)).toBe(
          returned === 1 ? "99999999999999.9999" : "0",
        );
      }
      expect(
        await db.fittingCoinEntry.count({
          where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
        }),
      ).toBe(1);
    });
    it.each(["REFUND", "CREDIT"] as const)(
      "settles %s after consumed near-limit grants without overflowing or forgiving debt",
      async (operation) => {
        await configure({
          rewards: [{ marketId, spendAmount: "0.0001", coins: "9999999999" }],
        });
        const c = await customer("0");
        const maximum = "99999999999999.9999";
        const source = async () => {
          const f = await returnFixture(db, {
            customerId: c.id,
            quantity: 1,
            price: "100",
          });
          await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
          return f;
        };
        const first = await source(),
          second = await source();
        const pending = await create(c.id);
        // Fixture for earlier completed uses: keep the original grants/entries
        // and consume their remaining balances without billions of UI requests.
        await db.$transaction(async (tx) => {
          await lockWallet(tx, c.id);
          for (const g of await usableGrants(tx, c.id, new Date())) {
            await tx.fittingCoinEntry.create({
              data: {
                customerId: c.id,
                sourceKey: `historic-spend:${g.id}`,
                amount: new Decimal(g.balance.toString()).neg().toFixed(),
                reason: "HISTORIC_SPEND_FIXTURE",
              },
            });
            await tx.fittingCoinGrant.update({
              where: { id: g.id },
              data: { balance: "0" },
            });
          }
        });
        const receive = async (f: Awaited<ReturnType<typeof source>>) => {
          const r = await requestReturn(c.id, {
            orderId: f.order.id,
            requestKey: randomUUID(),
            type: "RETURN",
            reasonCode: "SIZE",
            items: [{ orderItemId: f.order.items[0].id, quantity: 1 }],
          });
          await manageReturn(ownerId, {
            returnId: r.id,
            version: 0,
            operation: "APPROVE",
          });
          const item = await db.returnItem.findFirstOrThrow({
            where: { returnRequestId: r.id },
          });
          await manageReturn(ownerId, {
            returnId: r.id,
            version: 1,
            operation: "RECEIVE",
            conditions: [{ itemId: item.id, condition: "RESTOCK" }],
          });
          return r;
        };
        const returns = await Promise.all([receive(first), receive(second)]);
        await Promise.all(
          returns.map((r) =>
            manageReturn(ownerId, {
              returnId: r.id,
              version: 2,
              operation,
              note: "overflow debt fixture",
            }),
          ),
        );
        await Promise.all(
          [first, second].map((f) =>
            db.$transaction((tx) => revokeReturnedCoins(tx, f.order.id)),
          ),
        );
        expect((await walletView(c.id)).debt).toBe("199999999999999.9998");
        expect(await balance(c.id)).toBe("0");
        const overflow = await db.fittingCoinDebtOverflow.findMany({
          where: { customerId: c.id },
        });
        expect(overflow).toHaveLength(1);
        expect(overflow[0].amount.toString()).toBe(maximum);
        expect(overflow[0].balance.toString()).toBe(maximum);
        expect(
          await db.fittingCoinEntry.count({
            where: {
              customerId: c.id,
              reason: "RETURN_REVERSAL",
            },
          }),
        ).toBe(2);
        await expect(create(c.id)).rejects.toThrow("INSUFFICIENT_COINS");
        await source();
        expect((await walletView(c.id)).debt).toBe(maximum);
        expect(
          (
            await db.fittingWallet.findUniqueOrThrow({
              where: { customerId: c.id },
            })
          ).debt.toString(),
        ).toBe("0");
        await expect(create(c.id)).rejects.toThrow("INSUFFICIENT_COINS");
        await db.$transaction((tx) => refundSession(tx, pending.id, "TEST"));
        expect((await walletView(c.id)).debt).toBe("99999999999987.4999");
        expect(await balance(c.id)).toBe("0");
        await source();
        expect((await walletView(c.id)).debt).toBe("0");
        expect(await balance(c.id)).toBe("12.5");
        await db.$transaction((tx) => refundSession(tx, pending.id, "TEST"));
        expect(await balance(c.id)).toBe("12.5");
        const settled = await db.fittingCoinDebtOverflow.findUniqueOrThrow({
          where: { id: overflow[0].id },
        });
        expect(settled.amount.toString()).toBe(maximum);
        expect(settled.balance.toString()).toBe("0");
        expect((await create(c.id)).status).toBe("QUEUED");
      },
    );
    it.each(["REFUND", "CREDIT"] as const)(
      "reverses source sale rewards through nested exchanges and %s settlement",
      async (operation) => {
        await configure({
          rewards: [{ marketId, spendAmount: "100", coins: "25" }],
        });
        const f = await returnFixture(db, {
          customerId: (await customer("0")).id,
          quantity: 3,
          price: "100",
        });
        customers.push(f.customer.id);
        await db.$transaction((tx) => creditPaidOrder(tx, f.order.id));
        const receive = async (
          orderId: string,
          itemId: string,
          quantity: number,
          exchangeVariantId?: string,
        ) => {
          const request = await requestReturn(f.customer.id, {
            orderId,
            requestKey: randomUUID(),
            type: exchangeVariantId ? "EXCHANGE" : "RETURN",
            reasonCode: "SIZE",
            items: [
              {
                orderItemId: itemId,
                quantity,
                ...(exchangeVariantId ? { exchangeVariantId } : {}),
              },
            ],
          });
          await manageReturn(ownerId, {
            returnId: request.id,
            version: 0,
            operation: "APPROVE",
          });
          const item = await db.returnItem.findFirstOrThrow({
            where: { returnRequestId: request.id },
          });
          await manageReturn(ownerId, {
            returnId: request.id,
            version: 1,
            operation: "RECEIVE",
            conditions: [{ itemId: item.id, condition: "RESTOCK" }],
          });
          return request;
        };
        const first = await receive(
          f.order.id,
          f.order.items[0].id,
          2,
          f.variants[1].id,
        );
        const firstDone = await manageReturn(ownerId, {
          returnId: first.id,
          version: 2,
          operation: "EXCHANGE",
        });
        const child = await db.order.update({
          where: { id: firstDone.exchangeOrderId! },
          data: { status: "DELIVERED", deliveredAt: new Date() },
          include: { items: true },
        });
        const second = await receive(
          child.id,
          child.items[0].id,
          1,
          f.variants[0].id,
        );
        const secondDone = await manageReturn(ownerId, {
          returnId: second.id,
          version: 2,
          operation: "EXCHANGE",
        });
        const grandchild = await db.order.update({
          where: { id: secondDone.exchangeOrderId! },
          data: { status: "DELIVERED", deliveredAt: new Date() },
          include: { items: true },
        });
        expect(await balance(f.customer.id)).toBe("75");
        expect(
          await db.fittingCoinGrant.count({
            where: { orderId: { in: [child.id, grandchild.id] } },
          }),
        ).toBe(0);
        const terminal = await receive(
          grandchild.id,
          grandchild.items[0].id,
          1,
        );
        const direct = await receive(f.order.id, f.order.items[0].id, 1);
        await Promise.all(
          [terminal, direct].map((r) =>
            manageReturn(ownerId, {
              returnId: r.id,
              version: 2,
              operation,
              note: "source reward fixture",
            }),
          ),
        );
        expect(await balance(f.customer.id)).toBe("25");
        const last = await receive(child.id, child.items[0].id, 1);
        await manageReturn(ownerId, {
          returnId: last.id,
          version: 2,
          operation,
          note: "source reward fixture",
        });
        await db.$transaction((tx) => revokeReturnedCoins(tx, grandchild.id));
        await db.$transaction((tx) => revokeReturnedCoins(tx, child.id));
        expect(await balance(f.customer.id)).toBe("0");
        const grant = await db.fittingCoinGrant.findFirstOrThrow({
          where: { orderId: f.order.id, reason: "PURCHASE" },
        });
        expect(grant.revokedAmount.toString()).toBe("75");
        const reversals = await db.fittingCoinEntry.findMany({
          where: { customerId: f.customer.id, reason: "RETURN_REVERSAL" },
        });
        expect(
          reversals
            .reduce((sum, e) => sum.add(e.amount.toString()), new Decimal(0))
            .toString(),
        ).toBe("-75");
        expect(
          await db.fittingWallet
            .findUniqueOrThrow({ where: { customerId: f.customer.id } })
            .then((w) => w.debt.toString()),
        ).toBe("0");
      },
    );
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
          refundAmount: "100",
          items: {
            create: {
              orderItemId: f.order.items[0].id,
              quantity: 1,
              condition: "RESTOCK",
              refundAmount: "100",
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
