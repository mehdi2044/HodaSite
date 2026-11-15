import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedEditorialFixtures } from "../fixtures/editorial";
import {
  archiveEditorial,
  publishEditorial,
  saveEditorialDraft,
} from "@/modules/editorial/publication";
import { publishedEntry } from "@/modules/editorial/queries";
import { saveWeeklyLook } from "@/modules/editorial/weekly";
import { editorialContent } from "@/modules/editorial/contracts";
import { resolveLookCommerce } from "@/modules/editorial/commerce";

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
      await db.auditLog.deleteMany({
        where: { entityType: "EditorialEntry", entityId: entries },
      });
      await db.curatedLookItem.deleteMany({
        where: { revision: { entryId: entries } },
      });
      await db.editorialRevision.deleteMany({ where: { entryId: entries } });
      await db.editorialEntry.deleteMany({ where: { id: entries } });
    });
    async function draft() {
      const source = await publishedEntry(
        "LOOK",
        { id: "fixture-editorial-easy-days" },
        market,
      );
      const body = editorialContent.parse(source?.body);
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
