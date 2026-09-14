import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
const state = vi.hoisted(() => ({
  actor: null as string | null,
  complete: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (state.actor ? { user: { id: state.actor } } : null),
}));
vi.mock("@/modules/settings", () => ({ isMaintenanceOn: async () => false }));
vi.mock("@/modules/integrations/ai", () => ({
  keyStatus: () => ({ gemini: true, openai: true, anthropic: true }),
  provider: () => ({ complete: state.complete }),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: () => {},
  revalidateTag: () => {},
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((k: string) => k, { has: () => true }),
}));
import { db } from "@/lib/db";
import { AiError, defaultConfig } from "@/modules/ai/contracts";
import {
  generateProduct,
  applyProposal,
  reviewDrafts,
} from "@/modules/ai/products";
import { aiSettings, saveAiSettings, usageReport } from "@/modules/ai/settings";
import { financialSummary } from "@/modules/ai/financial";
import { queueProducts, registerAiJobs } from "@/modules/ai/worker";
import { runJobs } from "@/modules/jobs";
import { persistVariants } from "@/modules/catalog/persist-variants";
import { returnFixture } from "../helpers/returns";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  matrixSubjects,
  granted,
  fingerprint,
  type MatrixSubject,
} from "../helpers/permission-subjects";
const config = {
  ...defaultConfig,
  enabled: true,
  product: true,
  finance: true,
  cheap: { name: "fixture", inputUsd: "1", outputUsd: "1" },
  smart: { name: "fixture", inputUsd: "1", outputUsd: "1" },
  hardUsd: "1000",
  softUsd: "900",
};
const response = {
  fields: [{ key: "title.en", value: "Cream men's wool coat" }],
  suggestions: [],
};
const good = () =>
  Promise.resolve({
    text: JSON.stringify(response),
    inputTokens: 100,
    outputTokens: 100,
    complete: true,
  });
let subjects: MatrixSubject[], owner: string, tr: string;
const tables = [
  "AiUsage",
  "AiDraft",
  "AiCache",
  "PromptVersion",
  "Product",
  "Variant",
  "StockItem",
  "JournalEntry",
  "AuditLog",
  "Integration",
];
async function setupConfig() {
  await db.integration.upsert({
    where: { key: "ai" },
    create: { key: "ai", provider: "gemini", isActive: true, config },
    update: { isActive: true, config },
  });
  state.complete.mockReset().mockImplementation(good);
}
async function fixture() {
  const f = await returnFixture(db, { pending: true });
  await db.product.update({
    where: { id: f.variants[0].productId },
    data: { status: "DRAFT" },
  });
  return f;
}
const request = (id?: string) => ({
  requestKey: randomUUID(),
  productId: id,
  task: "generate",
  facts: { title: { fa: "پالتو پشمی مردانه کرم" } },
  mediaIds: [],
  vision: false,
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "phase07 AI budget, authorization and approved content",
  () => {
    beforeAll(async () => {
      subjects = await matrixSubjects();
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      tr = (await db.market.findUniqueOrThrow({ where: { code: "TR" } })).id;
      await setupConfig();
    });
    afterAll(async () => {
      await db.integration.update({
        where: { key: "ai" },
        data: { isActive: false, config: { ...config, enabled: false } },
      });
      state.actor = null;
    });
    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES) {
        it(`generation and review ${name}/${scope}`, async () => {
          state.actor = subjects.find(
            (s) => s.name === name && s.scope === scope,
          )!.id;
          const allowed =
            scope === "in" &&
            granted(name, "ai.product.generate") &&
            granted(name, "catalog.product.edit");
          const before = await fingerprint(tables),
            calls = state.complete.mock.calls.length;
          if (allowed) {
            const r = await generateProduct(request());
            expect(r.result.fields).toHaveLength(1);
            expect(await reviewDrafts()).toBeInstanceOf(Array);
          } else {
            await expect(generateProduct(request())).rejects.toThrow();
            await expect(reviewDrafts()).rejects.toThrow();
            expect(await fingerprint(tables)).toEqual(before);
            expect(state.complete.mock.calls.length).toBe(calls);
          }
        });
        it(`settings and usage ${name}/${scope}`, async () => {
          state.actor = subjects.find(
            (s) => s.name === name && s.scope === scope,
          )!.id;
          const before = await fingerprint(tables);
          if (scope === "in" && granted(name, "ai.settings.manage")) {
            expect((await aiSettings()).keys.gemini).toBe(true);
            await saveAiSettings({
              config,
              feature: "product",
              style: "Fixture precise style",
              forbiddenClaims: "No invention",
              confirm: true,
            });
          } else {
            await expect(aiSettings()).rejects.toThrow();
            await expect(
              saveAiSettings({
                config,
                feature: "product",
                style: "Fixture",
                forbiddenClaims: "",
                confirm: true,
              }),
            ).rejects.toThrow();
            expect(await fingerprint(tables)).toEqual(before);
          }
          if (scope === "in" && granted(name, "ai.usage.view"))
            expect((await usageReport()).count).toBeGreaterThanOrEqual(0);
          else await expect(usageReport()).rejects.toThrow();
        });
        it(`financial aggregates ${name}/${scope}`, async () => {
          state.actor = subjects.find(
            (s) => s.name === name && s.scope === scope,
          )!.id;
          const allowed =
            ["in", "market-out"].includes(scope) &&
            granted(name, "ai.finance.analyze") &&
            granted(name, "finance.report.view");
          const args = {
            marketId: tr,
            month: "2008-01",
            locale: "en",
            requestKey: randomUUID(),
          };
          const before = await fingerprint(tables),
            calls = state.complete.mock.calls.length;
          state.complete.mockResolvedValueOnce({
            text: JSON.stringify({
              summary: "No posted activity",
              anomalies: [],
            }),
            inputTokens: 20,
            outputTokens: 10,
            complete: true,
          });
          if (allowed) {
            expect((await financialSummary(args)).result.summary).toBe(
              "No posted activity",
            );
            const data = JSON.parse(state.complete.mock.calls.at(-1)![0].data);
            expect(Object.keys(data).sort()).toEqual([
              "aggregates",
              "instructions",
              "locale",
              "period",
            ]);
            expect(JSON.stringify(data)).not.toMatch(
              /customer|email|address|bankReference|orderId/,
            );
          } else {
            await expect(financialSummary(args)).rejects.toThrow();
            expect(await fingerprint(tables)).toEqual(before);
            expect(state.complete.mock.calls.length).toBe(calls);
          }
          state.complete.mockReset().mockImplementation(good);
        });
      }
    it("generation does not alter products; per-field Apply is idempotent and preserves stock and prices", async () => {
      state.actor = owner;
      await setupConfig();
      const f = await fixture();
      const before = await fingerprint([
        "Product",
        "Variant",
        "StockItem",
        "Lot",
        "Order",
        "JournalEntry",
      ]);
      const r = await generateProduct(request(f.variants[0].productId));
      expect(
        await fingerprint([
          "Product",
          "Variant",
          "StockItem",
          "Lot",
          "Order",
          "JournalEntry",
        ]),
      ).toEqual(before);
      const original = await db.product.findUniqueOrThrow({
        where: { id: f.variants[0].productId },
      });
      const args = {
        draftId: r.draftId,
        fields: r.result.fields,
        confirm: true,
      };
      await applyProposal(args);
      await applyProposal(args);
      const p = await db.product.findUniqueOrThrow({
        where: { id: f.variants[0].productId },
      });
      expect(p.titleI18n).toMatchObject({ en: "Cream men's wool coat" });
      expect(p.status).toBe("DRAFT");
      expect(p.basePriceAmount.toString()).toBe(
        original.basePriceAmount.toString(),
      );
      expect(await db.variant.count({ where: { productId: p.id } })).toBe(2);
      await expect(
        applyProposal({
          ...args,
          fields: [{ key: "status", value: "ACTIVE" }],
        }),
      ).rejects.toThrow();
    });
    it("detects concurrent product edits and revoked Apply permission", async () => {
      state.actor = owner;
      const f = await fixture(),
        r = await generateProduct(request(f.variants[0].productId));
      await db.product.update({
        where: { id: f.variants[0].productId },
        data: { material: "Manual update" },
      });
      await expect(
        applyProposal({
          draftId: r.draftId,
          fields: r.result.fields,
          confirm: true,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const r2 = await generateProduct(request(f.variants[0].productId));
      await db.userPermissionOverride.create({
        data: {
          userId: owner,
          permission: "ai.product.generate",
          allow: false,
        },
      });
      try {
        await expect(
          applyProposal({
            draftId: r2.draftId,
            fields: r2.result.fields,
            confirm: true,
          }),
        ).rejects.toThrow("FORBIDDEN");
      } finally {
        await db.userPermissionOverride.deleteMany({
          where: {
            userId: owner,
            permission: "ai.product.generate",
            allow: false,
          },
        });
      }
    });
    it("stops at a hard cap before calling the provider and shares concurrency reservations", async () => {
      state.actor = owner;
      await setupConfig();
      await db.integration.update({
        where: { key: "ai" },
        data: { config: { ...config, hardUsd: "0.0001", softUsd: "0" } },
      });
      const calls = state.complete.mock.calls.length;
      await expect(
        generateProduct({ ...request(), facts: { title: "unique hard cap" } }),
      ).rejects.toMatchObject({ code: "BUDGET" });
      expect(state.complete.mock.calls.length).toBe(calls);
      await db.integration.update({
        where: { key: "ai" },
        data: { config: { ...config, concurrency: 1 } },
      });
      let release!: (value: Awaited<ReturnType<typeof good>>) => void;
      let started!: () => void;
      const began = new Promise<void>((resolve) => {
        started = resolve;
      });
      state.complete.mockImplementationOnce(() => {
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      });
      const first = generateProduct({
        ...request(),
        facts: { title: "concurrency unique wool" },
      });
      await began;
      await expect(
        generateProduct({
          ...request(),
          facts: { title: "second distinct wool" },
        }),
      ).rejects.toMatchObject({ code: "BUSY" });
      release(await good());
      await first;
      await setupConfig();
    });
    it("unknown outcomes retain cost and retry keys do not repeat provider spending; cache avoids a fresh call", async () => {
      state.actor = owner;
      await setupConfig();
      const a = { ...request(), facts: { title: "unknown unique wool" } };
      state.complete.mockRejectedValueOnce(new AiError("NETWORK_UNKNOWN"));
      await expect(generateProduct(a)).rejects.toMatchObject({
        code: "NETWORK_UNKNOWN",
      });
      const row = await db.aiUsage.findUniqueOrThrow({
        where: { requestKey: a.requestKey },
      });
      expect(row.costUsd.gt(0)).toBe(true);
      const count = state.complete.mock.calls.length;
      await expect(generateProduct(a)).rejects.toMatchObject({
        code: "NETWORK_UNKNOWN",
      });
      expect(state.complete.mock.calls.length).toBe(count);
      const b = { ...request(), facts: { title: "cache unique wool" } };
      await generateProduct(b);
      const calls = state.complete.mock.calls.length;
      const cached = await generateProduct({ ...b, requestKey: randomUUID() });
      expect(cached.cached).toBe(true);
      expect(cached.costUsd).toBe("0.0000");
      expect(state.complete.mock.calls.length).toBe(calls);
      await expect(
        db.aiUsage.delete({ where: { id: row.id } }),
      ).rejects.toThrow();
      await expect(
        db.promptVersion.update({
          where: { id: row.promptVersionId },
          data: { style: "Changed history" },
        }),
      ).rejects.toThrow();
    });
    it("bulk jobs produce review drafts once and never publish", async () => {
      state.actor = owner;
      await setupConfig();
      const f = await fixture();
      await db.product.update({
        where: { id: f.variants[0].productId },
        data: {
          titleI18n: { fa: "پالتو پشمی", tr: "Yün palto", en: "Wool coat" },
        },
      });
      const input = {
        productIds: [f.variants[0].productId],
        requestKey: randomUUID(),
        confirm: true,
      };
      await queueProducts(input);
      await queueProducts(input);
      registerAiJobs();
      await runJobs(["ai-product"]);
      expect(
        await db.aiDraft.count({
          where: { productId: f.variants[0].productId, status: "REVIEW" },
        }),
      ).toBe(1);
      expect(
        (
          await db.product.findUniqueOrThrow({
            where: { id: f.variants[0].productId },
          })
        ).status,
      ).toBe("DRAFT");
    });
    it("saving a product preserves sold variant identities and deactivates removed variants", async () => {
      const f = await returnFixture(db);
      const variants = await db.variant.findMany({
          where: { productId: f.variants[0].productId },
        }),
        v = variants.find((v) => v.id === f.variants[0].id)!;
      const oldStock = await fingerprint(["StockItem", "Lot", "OrderItem"]);
      await db.$transaction((tx) =>
        persistVariants(tx, f.variants[0].productId, [
          {
            id: v.id,
            sku: v.sku,
            colorId: v.colorId,
            sizeId: v.sizeId,
            barcode: v.barcode ?? "",
            priceOverrideUsd: v.priceOverrideUsd?.toString() ?? "",
            isActive: true,
            mediaIds: [],
          },
        ]),
      );
      expect(await fingerprint(["StockItem", "Lot", "OrderItem"])).toEqual(
        oldStock,
      );
      expect(
        (await db.variant.findUniqueOrThrow({ where: { id: v.id } })).id,
      ).toBe(v.id);
      expect(
        await db.variant.count({
          where: { productId: f.variants[0].productId, isActive: false },
        }),
      ).toBe(1);
    });
  },
);
