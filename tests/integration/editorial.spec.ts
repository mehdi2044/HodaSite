import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  changeEditorial,
  writeEditorial,
} from "@/app/admin/(dashboard)/content/editorial/actions";
import { scheduleWeekly } from "@/app/admin/(dashboard)/content/editorial/weekly/actions";
import { seedEditorialFixtures } from "../fixtures/editorial";
import {
  archiveEditorial,
  publishEditorial,
  saveEditorialDraft,
} from "@/modules/editorial/publication";
import { publishedBySlug, publishedEntry } from "@/modules/editorial/queries";
import { saveWeeklyLook } from "@/modules/editorial/weekly";
import { editorialContent } from "@/modules/editorial/contracts";
import { tokenHash } from "@/lib/secure-tokens";
import {
  addCuratedLook,
  resolveLookCommerce,
} from "@/modules/editorial/commerce";

const request = vi.hoisted(() => ({
  market: { id: "", currency: "" },
  token: "",
  actorId: "",
}));
vi.mock("@/modules/auth", () => ({
  auth: async () =>
    request.actorId ? { user: { id: request.actorId } } : null,
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const isolated = process.env.EDITORIAL_TEST_DATABASE_URL;
  if (!isolated) return importOriginal<typeof import("@/lib/db")>();

  const editorial = new URL(isolated);
  const shared = process.env.TEST_DATABASE_URL;
  if (
    !shared ||
    !editorial.pathname.endsWith("_test") ||
    editorial.pathname === new URL(shared).pathname
  )
    throw new Error(
      "Editorial requires a differently named dedicated _test database",
    );
  const { PrismaClient } = await import("@prisma/client");
  return { db: new PrismaClient({ datasources: { db: { url: isolated } } }) };
});
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: async () => ({ market: request.market }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: request.token }),
    set: vi.fn(),
  }),
}));

describe.runIf(Boolean(process.env.TEST_DATABASE_URL))(
  "editorial PostgreSQL workflow",
  () => {
    let owner: string, market: string;
    const ids: string[] = [];
    beforeAll(async () => {
      await seedEditorialFixtures(db);
      owner = (
        await db.user.findFirstOrThrow({
          where: { roles: { some: { role: { key: "owner" } } } },
        })
      ).id;
      market = (await db.market.findFirstOrThrow({ where: { code: "IR" } })).id;
    });
    afterAll(async () => {
      const entries = { in: ids };
      await db.weeklyLookFeature.deleteMany({ where: { entryId: entries } });
      await db.curatedLookItem.deleteMany({
        where: { revision: { entryId: entries } },
      });
      await db.editorialRevision.deleteMany({ where: { entryId: entries } });
      await db.editorialEntry.deleteMany({ where: { id: entries } });
      if (process.env.EDITORIAL_TEST_DATABASE_URL) await db.$disconnect();
    });
    async function draft() {
      const source = await publishedEntry(
        "LOOK",
        { id: "fixture-editorial-easy-days" },
        market,
      );
      const body = editorialContent.parse({
        ...editorialContent.parse(source?.body),
        marketIds: [market],
      });
      const slug = `integration-${randomUUID()}`;
      const entry = await saveEditorialDraft(owner, {
        body,
        version: 0,
        slugs: { fa: slug, tr: slug, en: slug },
      });
      ids.push(entry.id);
      const revision = await db.editorialRevision.findFirstOrThrow({
        where: { entryId: entry.id },
      });
      return { entry, revision, body };
    }
    it("resolves percent-encoded Persian slugs from canonical rewrites", async () => {
      const look = await publishedBySlug(
        "LOOK",
        "fa",
        encodeURIComponent("روزهای-راحت"),
        market,
      );
      const article = await publishedBySlug(
        "ARTICLE",
        "fa",
        encodeURIComponent("استایل-روزمره"),
        market,
      );
      expect(look?.id).toBe("fixture-editorial-easy-days");
      expect(article?.id).toBe("fixture-editorial-easy-days-story");
      expect(await publishedBySlug("LOOK", "fa", "%GG", market)).toBeNull();
    });

    it("enforces draft and publication permissions through the real admin actions", async () => {
      const { entry, revision, body } = await draft();
      const actor = await db.user.create({
        data: {
          email: "editorial-test-" + randomUUID() + "@example.com",
          name: "Editorial test editor",
          passwordHash: "unused-test-fixture",
        },
      });
      const draftForm = new FormData();
      draftForm.set("id", entry.id);
      draftForm.set("version", String(entry.version));
      draftForm.set("body", JSON.stringify(body));
      const publicationForm = new FormData();
      publicationForm.set("id", entry.id);
      publicationForm.set("version", String(entry.version));
      publicationForm.set("revisionId", revision.id);
      const weeklyForm = new FormData();
      weeklyForm.set("id", entry.id);
      weeklyForm.set("slot", "MEN");
      const year = new Date().getUTCFullYear() + 2;
      weeklyForm.set("start", year + "-01-03T10:00");
      weeklyForm.set("end", year + "-01-10T10:00");

      try {
        await expect(writeEditorial(null, draftForm)).resolves.toMatchObject({
          code: "UNAUTHORIZED",
        });
        await expect(scheduleWeekly(null, weeklyForm)).resolves.toMatchObject({
          code: "UNAUTHORIZED",
        });
        request.actorId = actor.id;
        await expect(writeEditorial(null, draftForm)).resolves.toMatchObject({
          code: "FORBIDDEN",
        });
        await db.userPermissionOverride.create({
          data: {
            userId: actor.id,
            permission: "content.page.write",
            allow: true,
          },
        });
        await expect(
          changeEditorial(null, publicationForm),
        ).resolves.toMatchObject({
          code: "FORBIDDEN",
        });
        publicationForm.set("operation", "archive");
        await expect(
          changeEditorial(null, publicationForm),
        ).resolves.toMatchObject({
          code: "FORBIDDEN",
        });
        request.actorId = owner;
        publicationForm.delete("operation");
        await expect(changeEditorial(null, publicationForm)).resolves.toEqual({
          ok: true,
        });
        request.actorId = actor.id;
        await expect(scheduleWeekly(null, weeklyForm)).resolves.toMatchObject({
          code: "FORBIDDEN",
        });
        expect(
          await db.editorialRevision.count({ where: { entryId: entry.id } }),
        ).toBe(1);
        expect(
          await db.weeklyLookFeature.count({ where: { entryId: entry.id } }),
        ).toBe(0);
        expect(
          await db.auditLog.count({
            where: { entityId: entry.id, userId: actor.id },
          }),
        ).toBe(0);
        request.actorId = owner;
        await expect(scheduleWeekly(null, weeklyForm)).resolves.toEqual({
          ok: true,
        });
        expect(
          await db.weeklyLookFeature.count({ where: { entryId: entry.id } }),
        ).toBe(1);
      } finally {
        request.actorId = "";
        await db.user.delete({ where: { id: actor.id } });
      }
    });

    it("separates drafts from public revisions, schedules in the future, and archives", async () => {
      const { entry, revision, body } = await draft();
      expect(await publishedEntry("LOOK", { id: entry.id }, market)).toBeNull();
      await expect(
        publishEditorial(owner, {
          id: entry.id,
          version: entry.version + 1,
          revisionId: revision.id,
        }),
      ).rejects.toThrow("revision_conflict");
      await publishEditorial(owner, {
        id: entry.id,
        version: entry.version,
        revisionId: revision.id,
      });
      expect(
        (await publishedEntry("LOOK", { id: entry.id }, market))?.revision.id,
      ).toBe(revision.id);
      const draft2 = await saveEditorialDraft(owner, {
        id: entry.id,
        version: entry.version + 1,
        body: { ...body, featured: false },
      });
      const scheduled = await db.editorialRevision.findFirstOrThrow({
        where: { entryId: entry.id, number: draft2.version },
      });
      const date = new Date(Date.now() + 60_000);
      await publishEditorial(owner, {
        id: entry.id,
        version: draft2.version,
        revisionId: scheduled.id,
        date,
      });
      expect(
        (await publishedEntry("LOOK", { id: entry.id }, market))?.revision.id,
      ).toBe(revision.id);
      expect(
        (await publishedEntry("LOOK", { id: entry.id }, market, db, date))
          ?.revision.id,
      ).toBe(scheduled.id);
      await archiveEditorial(owner, entry.id, draft2.version + 1);
      expect(
        await publishedEntry("LOOK", { id: entry.id }, market, db, date),
      ).toBeNull();
      expect(await db.auditLog.count({ where: { entityId: entry.id } })).toBe(
        5,
      );
    });
    it("rejects forged catalog references and authorization before writes", async () => {
      const { entry, body } = await draft();
      if (body.kind !== "LOOK") throw new Error("Wrong fixture");
      await expect(
        saveEditorialDraft("missing-user", {
          id: entry.id,
          version: entry.version,
          body,
        }),
      ).rejects.toThrow();
      await expect(
        saveEditorialDraft(owner, {
          id: entry.id,
          version: entry.version,
          body: {
            ...body,
            items: [{ ...body.items[0], variantId: "unknown" }],
          },
        }),
      ).rejects.toThrow();
      expect(
        await db.editorialRevision.count({ where: { entryId: entry.id } }),
      ).toBe(1);
    });
    it("withholds a one-piece draft and a photograph with stale colour evidence", async () => {
      const { entry, body } = await draft();
      if (body.kind !== "LOOK" || body.visual?.mode !== "PHOTO")
        throw new Error("Expected photo fixture");
      for (const candidate of [
        { ...body, items: body.items.slice(0, 1) },
        {
          ...body,
          visual: {
            ...body.visual,
            pieces: body.visual.pieces.map((piece) => ({
              ...piece,
              colorId: "stale-color",
            })),
          },
        },
      ]) {
        const before = await db.editorialEntry.findUniqueOrThrow({
          where: { id: entry.id },
        });
        const written = await saveEditorialDraft(owner, {
          id: entry.id,
          version: before.version,
          body: candidate,
        });
        const revision = await db.editorialRevision.findFirstOrThrow({
          where: { entryId: entry.id, number: written.version },
        });
        await expect(
          publishEditorial(owner, {
            id: entry.id,
            version: written.version,
            revisionId: revision.id,
          }),
        ).rejects.toThrow();
        expect(
          await publishedEntry("LOOK", { id: entry.id }, market),
        ).toBeNull();
      }
    });
    it("serializes overlapping weekly assignments and accepts adjacent times", async () => {
      const { entry, revision } = await draft();
      await publishEditorial(owner, {
        id: entry.id,
        version: entry.version,
        revisionId: revision.id,
      });
      const startsAt = new Date("2091-01-01T00:00:00Z"),
        endsAt = new Date("2091-01-08T00:00:00Z");
      const results = await Promise.allSettled(
        [0, 1].map(() =>
          saveWeeklyLook(owner, {
            id: entry.id,
            slot: "MEN",
            startsAt,
            endsAt,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      await expect(
        saveWeeklyLook(owner, {
          id: entry.id,
          slot: "MEN",
          startsAt: endsAt,
          endsAt: new Date("2091-01-15T00:00:00Z"),
        }),
      ).resolves.toBeUndefined();
    });
    it("inserts the entire cart selection once and rejects unrelated or stale variants", async () => {
      const look = await publishedEntry(
        "LOOK",
        { id: "fixture-editorial-easy-days" },
        market,
      );
      if (!look || look.body.kind !== "LOOK") throw new Error("Wrong fixture");
      request.market = await db.market.findUniqueOrThrow({
        where: { id: market },
      });
      request.token = randomUUID();
      const cart = await db.cart.create({
        data: {
          tokenHash: tokenHash(request.token),
          marketId: market,
          locale: "fa",
          currency: request.market.currency,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const variants = look.body.items.map((item) => item.variantId);
      try {
        await expect(
          addCuratedLook("fa", look.id, look.revision.id, [
            variants[0],
            "forged-variant",
          ]),
        ).rejects.toThrow();
        expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
        await expect(
          addCuratedLook("fa", look.id, "old-revision", variants),
        ).rejects.toThrow();
        await addCuratedLook("fa", look.id, look.revision.id, variants);
        await addCuratedLook("fa", look.id, look.revision.id, variants);
        const items = await db.cartItem.findMany({
          where: { cartId: cart.id },
        });
        expect(items.map(({ variantId }) => variantId).sort()).toEqual(
          variants.sort(),
        );
        expect(items.every(({ quantity }) => quantity === 1)).toBe(true);
      } finally {
        await db.cartItem.deleteMany({ where: { cartId: cart.id } });
        await db.cart.delete({ where: { id: cart.id } });
      }
    });
    it("retains other buyable pieces after one product stops appearing in the market", async () => {
      const { body } = await draft();
      if (body.kind !== "LOOK") throw new Error("Wrong fixture");
      const current = await db.market.findUniqueOrThrow({
        where: { id: market },
      });
      const [commerce] = await resolveLookCommerce(
        [
          {
            ...body,
            items: [
              ...body.items.slice(0, 2),
              { productId: "missing-product", variantId: "missing-variant" },
            ],
          },
        ],
        current,
        "fa",
      );
      expect(commerce.pieces).toHaveLength(3);
      expect(commerce.pieces[2]).toMatchObject({ href: null, variants: [] });
      expect(commerce.available).toBe(2);
      expect(Number(commerce.amount)).toBeGreaterThan(0);
    });
  },
);
