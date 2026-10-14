import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getHomepage, type HomepageBlock } from "@/modules/content/homepage";
import { shoppableSceneSchema } from "@/modules/content/scenes/contracts";
import {
  saveHomepageDraft,
  publishHomepageRevision,
  scheduleHomepageRevision,
} from "@/modules/content/publication";
import {
  registerHomepagePublicationJobs,
  executeHomepagePublication,
} from "@/modules/content/publication-worker";
import { runJobs } from "@/modules/jobs";
import { RevisionConflictError } from "@/lib/revision-conflict";
import { setMaintenanceFlag } from "@/modules/settings";

const session = vi.hoisted(() => ({ actor: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (session.actor ? { user: { id: session.actor } } : null),
}));
import {
  resolveShoppableScene,
  scenePriceRange,
} from "@/modules/content/scenes/resolve";
import { POST as previewPOST } from "@/app/api/admin/scenes/preview/route";

const text = { fa: "صحنهٔ آزمون", tr: "Sahne testi", en: "Scene proof" };
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3a real publication lifecycle",
  () => {
    let owner: string, marketId: string, scoped: string, referenceId: string;
    let blocks: HomepageBlock[];
    let originalPrice: Prisma.Decimal;
    let originalMarkets: string[];
    beforeAll(async () => {
      setMaintenanceFlag(false);
      await db.market.update({
        where: { code: "CA" },
        data: { isActive: true },
      });
      registerHomepagePublicationJobs();
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      const ca = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      marketId = (
        await db.market.create({
          data: {
            code: `R3${randomUUID().replaceAll("-", "").slice(0, 12)}`,
            name: "R3 publication fixture",
            currency: ca.currency,
            defaultLocale: "en",
            enabledLocales: ["fa", "tr", "en"],
            roundingRule: ca.roundingRule as Prisma.InputJsonValue,
            markupPercent: ca.markupPercent,
            holdHours: 6,
            paymentDeadlineHours: 48,
            fxMode: "REQUIRE_APPROVAL",
          },
        })
      ).id;
      const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
      const role = await db.role.findUniqueOrThrow({
        where: { key: "marketing" },
      });
      scoped = (
        await db.user.create({
          data: {
            email: `r3-scope-${randomUUID()}@example.com`,
            name: "Scope fixture",
            passwordHash: "invalid-test-hash",
            roles: { create: { roleId: role.id, scope: { marketId: tr.id } } },
          },
        })
      ).id;
      const product = await db.product.findUniqueOrThrow({
        where: { id: "seed-style-v2-women-coat" },
        include: { media: true, variants: { include: { media: true } } },
      });
      originalPrice = product.basePriceAmount;
      originalMarkets = product.marketIds;
      await db.product.update({
        where: { id: product.id },
        data: { marketIds: [...product.marketIds, marketId] },
      });
      const variant =
        product.variants.find((v) => v.media.length) ?? product.variants[0];
      referenceId = (variant.media[0] ?? product.media[0]).mediaId;
      const scene = shoppableSceneSchema.parse({
        version: 1,
        id: "r3-proof-scene",
        mode: "PHOTO",
        title: text,
        alt: text,
        desktop: { mediaId: "seed-fashion-v2-look-women-coat" },
        mobile: { mediaId: "seed-fashion-v2-look-women-coat" },
        pieces: [
          {
            id: "coat-piece",
            productId: product.id,
            colorId: variant.colorId,
            referenceMediaId: referenceId,
            desktop: { x: 0.4, y: 0.4 },
            mobile: { x: 0.3, y: 0.5 },
          },
        ],
        match: {
          fingerprint: "0".repeat(64),
          confirmedAt: new Date().toISOString(),
        },
      });
      blocks = [
        { type: "Hero", title: text, body: text, ctaLabel: text, scene },
      ];
    });
    afterAll(async () => {
      if (originalPrice)
        await db.product.update({
          where: { id: "seed-style-v2-women-coat" },
          data: { basePriceAmount: originalPrice, marketIds: originalMarkets },
        });
      if (marketId) {
        await db.homepage.updateMany({
          where: { marketId },
          data: { deletedAt: new Date() },
        });
        await db.market.update({
          where: { id: marketId },
          data: { isActive: false },
        });
      }
      if (scoped)
        await db.user.update({
          where: { id: scoped },
          data: { isActive: false },
        });
    });
    const row = () =>
      db.homepage.findFirstOrThrow({ where: { marketId, deletedAt: null } });
    it("retains global published fallback, ignores forged approval and preserves live content on denied publish", async () => {
      const global = await getHomepage(marketId);
      const before = await db.homepage.findFirst({
        where: { marketId, deletedAt: null },
      });
      const saved = await saveHomepageDraft(owner, {
        marketId,
        expectedVersion: before?.version ?? 0,
        blocks,
      });
      expect((await getHomepage(marketId)).id).toBe(global.id);
      const fresh = await row();
      expect(fresh.isPublished).toBe(false);
      expect(JSON.stringify(fresh.draftBlocks)).not.toContain("0".repeat(64));
      await expect(
        publishHomepageRevision(owner, {
          homepageId: saved.id,
          revisionId: saved.revisionId,
          expectedVersion: saved.version,
        }),
      ).rejects.toThrow();
      expect((await row()).version).toBe(saved.version);
      expect((await getHomepage(marketId)).id).toBe(global.id);
    });
    it("requires explicit image confirmation, publishes it, and preserves it across price-only edits", async () => {
      const before = await row();
      const saved = await saveHomepageDraft(owner, {
        marketId,
        expectedVersion: before.version,
        blocks,
        confirmSceneIds: ["r3-proof-scene"],
      });
      const draft = await row();
      expect(JSON.stringify(draft.draftBlocks)).toMatch(/fingerprint/);
      await publishHomepageRevision(owner, {
        homepageId: saved.id,
        revisionId: saved.revisionId,
        expectedVersion: saved.version,
      });
      expect((await getHomepage(marketId)).id).toBe(saved.id);
      await db.product.update({
        where: { id: "seed-style-v2-women-coat" },
        data: { basePriceAmount: originalPrice.add("0.0001") },
      });
      const after = await row();
      const edited = await saveHomepageDraft(owner, {
        marketId,
        expectedVersion: after.version,
        blocks: after.draftBlocks,
      });
      await publishHomepageRevision(owner, {
        homepageId: edited.id,
        revisionId: edited.revisionId,
        expectedVersion: edited.version,
      });
      expect((await row()).publishedRevisionId).toBe(edited.revisionId);
    });
    it("resolves actual size prices, current FX and live stock without invalidating photographed pixels", async () => {
      const ca = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      const current = await row();
      const scene = (current.draftBlocks as unknown as HomepageBlock[]).flatMap(
        (b) => ("scene" in b && b.scene ? [b.scene] : []),
      )[0];
      const variants = await db.variant.findMany({
        where: { productId: "seed-style-v2-women-coat", isActive: true },
        orderBy: { id: "asc" },
      });
      const stock = await db.stockItem.findMany({
        where: { variantId: variants[0].id },
      });
      const override = await db.fxOverride.create({
        data: {
          marketId: ca.id,
          rate: "1.12500001",
          validFrom: new Date(Date.now() - 1000),
          note: "Synthetic live scene FX proof",
          createdBy: owner,
        },
      });
      try {
        await db.variant.update({
          where: { id: variants[0].id },
          data: { priceOverrideUsd: "51.1234" },
        });
        await db.variant.update({
          where: { id: variants[1].id },
          data: { priceOverrideUsd: "79.5678" },
        });
        const first = await resolveShoppableScene(scene, ca, "en");
        expect(first.reason).toBe(null);
        expect(first.currency).toBe(ca.currency);
        const firstAmounts = first.pieces[0].variants
          .filter((v) => v.available > 0)
          .map((v) => v.amount!);
        expect(new Set(firstAmounts).size).toBeGreaterThan(1);
        expect(first.pieces[0].range).toEqual(scenePriceRange(firstAmounts));
        await db.fxOverride.update({
          where: { id: override.id },
          data: { rate: "1.87500001" },
        });
        const repriced = await resolveShoppableScene(scene, ca, "en");
        expect(repriced.reason).toBe(null);
        expect(repriced.pieces[0].range).not.toEqual(first.pieces[0].range);
        await db.stockItem.updateMany({
          where: { variantId: variants[0].id },
          data: { onHand: 0, reserved: 0 },
        });
        const unavailable = await resolveShoppableScene(scene, ca, "en");
        expect(unavailable.reason).toBe(null);
        expect(
          unavailable.pieces[0].variants.find((v) => v.id === variants[0].id)
            ?.available,
        ).toBe(0);
        expect(unavailable.pieces[0].range).toEqual(
          scenePriceRange(
            unavailable.pieces[0].variants
              .filter((v) => v.available > 0)
              .map((v) => v.amount!),
          ),
        );
      } finally {
        await db.fxOverride.delete({ where: { id: override.id } });
        for (const variant of variants)
          await db.variant.update({
            where: { id: variant.id },
            data: { priceOverrideUsd: variant.priceOverrideUsd },
          });
        for (const item of stock)
          await db.stockItem.update({
            where: { id: item.id },
            data: { onHand: item.onHand, reserved: item.reserved },
          });
      }
      expect((await row()).version).toBe(current.version);
    });
    it("serializes same-version drafts and denies an outside-market actor without revision/audit changes", async () => {
      const before = await row();
      const count = await db.auditLog.count({
        where: { entityType: "Homepage", entityId: before.id },
      });
      await expect(
        saveHomepageDraft(scoped, {
          marketId,
          expectedVersion: before.version,
          blocks: before.draftBlocks,
        }),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        await db.auditLog.count({
          where: { entityType: "Homepage", entityId: before.id },
        }),
      ).toBe(count);
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          saveHomepageDraft(owner, {
            marketId,
            expectedVersion: before.version,
            blocks: before.draftBlocks,
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ).toBeInstanceOf(RevisionConflictError);
      const fresh = await row();
      expect(fresh.version).toBe(before.version + 1);
      await expect(
        db.auditLog.update({
          where: { id: fresh.draftRevisionId! },
          data: { action: "forged" },
        }),
      ).rejects.toThrow(/append-only/);
    });
    it("fails an invalidated schedule visibly without automatic retry or changing published blocks", async () => {
      const before = await row();
      const scheduled = await scheduleHomepageRevision(owner, {
        homepageId: before.id,
        revisionId: before.draftRevisionId,
        expectedVersion: before.version,
        at: new Date(Date.now() + 1000),
      });
      await db.homepage.update({
        where: { id: before.id },
        data: { scheduledAt: new Date(Date.now() - 1000) },
      });
      await db.job.update({
        where: { id: scheduled.jobId },
        data: { runAt: new Date(Date.now() - 1000) },
      });
      await db.media.update({
        where: { id: referenceId },
        data: { status: "PROCESSING" },
      });
      try {
        await runJobs(["homepage-publish"]);
        const fresh = await row();
        expect(fresh.scheduleError).toBe("INVALID_REFERENCES");
        expect(fresh.blocks).toEqual(before.blocks);
        expect(
          await db.job.findUniqueOrThrow({ where: { id: scheduled.jobId } }),
        ).toMatchObject({
          status: "FAILED",
          attempts: 1,
          lastError: "INVALID_REFERENCES",
        });
      } finally {
        await db.media.update({
          where: { id: referenceId },
          data: { status: "READY" },
        });
      }
    });
    it("keeps authorized draft preview private, read-only and inside actual market scope", async () => {
      const request = (payload: unknown) =>
        new Request("http://localhost/api/admin/scenes/preview", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      session.actor = null;
      const denied = await previewPOST(request({}));
      expect(denied.status).toBe(401);
      expect(denied.headers.get("cache-control")).toContain(
        "private, no-store",
      );
      expect(denied.headers.get("x-robots-tag")).toContain("noindex");
      const current = await row();
      const scene = (current.draftBlocks as unknown as HomepageBlock[]).flatMap(
        (b) => ("scene" in b && b.scene ? [b.scene] : []),
      )[0];
      const input = { scopeMarketId: marketId, marketId, locale: "en", scene };
      session.actor = scoped;
      expect((await previewPOST(request(input))).status).toBe(403);
      session.actor = owner;
      const auditCount = await db.auditLog.count();
      const response = await previewPOST(request(input));
      expect(response.status).toBe(200);
      expect(response.headers.get("vary")).toBe("Cookie");
      const result = await response.json();
      expect(result.view.pieces).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("confirmedAt");
      expect(JSON.stringify(result)).not.toContain("fingerprint");
      expect((await row()).version).toBe(current.version);
      expect(await db.auditLog.count()).toBe(auditCount);
      session.actor = null;
    });
    it("publishes a valid schedule once and replays its successful job without duplicating publication", async () => {
      const before = await row();
      const scheduled = await scheduleHomepageRevision(owner, {
        homepageId: before.id,
        revisionId: before.draftRevisionId,
        expectedVersion: before.version,
        at: new Date(Date.now() + 1000),
      });
      await db.homepage.update({
        where: { id: before.id },
        data: { scheduledAt: new Date(Date.now() - 1000) },
      });
      await db.job.update({
        where: { id: scheduled.jobId },
        data: { runAt: new Date(Date.now() - 1000) },
      });
      await runJobs(["homepage-publish"]);
      const job = await db.job.findUniqueOrThrow({
        where: { id: scheduled.jobId },
      });
      expect(job.status).toBe("DONE");
      const committed = await row();
      await db.user.update({ where: { id: owner }, data: { isActive: false } });
      try {
        await executeHomepagePublication({
          id: job.id,
          type: job.type,
          payload: job.payload,
          attempts: job.attempts,
        });
      } finally {
        await db.user.update({
          where: { id: owner },
          data: { isActive: true },
        });
      }
      expect((await row()).version).toBe(committed.version);
      expect(
        await db.auditLog.count({
          where: {
            entityId: before.id,
            action: "content.homepage.published",
            after: { path: ["jobId"], equals: job.id },
          },
        }),
      ).toBe(1);
    });
  },
);
