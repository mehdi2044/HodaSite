import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  prepareHomepagePreview,
  readHomepagePreview,
} from "@/modules/content/private-homepage-preview";
import { saveHomepageDraft } from "@/modules/content/publication";
import { setMaintenanceFlag } from "@/modules/settings";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b scoped private full unsaved snapshots: no publication, owner isolation and monotonic races",
  () => {
    let scoped = "",
      owner = "",
      marketId = "",
      otherMarket = "",
      quotaUser = "";
    const actors: string[] = [],
      roleKey = `preview-reader-${randomUUID()}`;
    const blocks = (en: string) => [
      { type: "RichText", text: { fa: "آزمون", tr: "Deneme", en } },
    ];
    const input = (channel: string, sequence = 1) => ({
      channel,
      sequence,
      scopeMarketId: marketId,
      marketId,
      locale: "en",
      blocks: blocks(`Draft ${sequence}`),
    });
    beforeAll(async () => {
      setMaintenanceFlag(false);
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      marketId = (await db.market.findUniqueOrThrow({ where: { code: "CA" } }))
        .id;
      otherMarket = (
        await db.market.findUniqueOrThrow({ where: { code: "TR" } })
      ).id;
      const role = await db.role.create({
        data: {
          key: roleKey,
          nameI18n: { fa: "خواننده آزمون", tr: "Deneme", en: "Fixture reader" },
          permissions: { create: [{ permission: "content.homepage.read" }] },
        },
      });
      for (const name of ["scope", "quota"]) {
        const actor = await db.user.create({
          data: {
            email: `${name}-${randomUUID()}@example.com`,
            passwordHash: "invalid-fixture-hash",
            name: "Private preview fixture",
            roles: { create: [{ roleId: role.id, scope: { marketId } }] },
          },
        });
        actors.push(actor.id);
      }
      [scoped, quotaUser] = actors;
    });
    afterAll(async () => {
      await db.homepagePreview.deleteMany({
        where: { ownerId: { in: actors } },
      });
      await db.user.updateMany({
        where: { id: { in: actors } },
        data: { isActive: false },
      });
    });
    it("allows authorized read-only preview preparation without any saved draft/publication/audit or commerce effect", async () => {
      const homes = await db.homepage.findMany({ orderBy: { id: "asc" } }),
        audits = await db.auditLog.count();
      const channel = randomUUID();
      await prepareHomepagePreview(scoped, input(channel));
      const snapshot = await readHomepagePreview(scoped, channel);
      expect(snapshot.blocks[0]).toMatchObject({
        type: "RichText",
        text: { en: "Draft 1" },
      });
      expect(await db.homepage.findMany({ orderBy: { id: "asc" } })).toEqual(
        homes,
      );
      expect(await db.auditLog.count()).toBe(audits);
      await expect(
        saveHomepageDraft(scoped, {
          marketId,
          expectedVersion: 0,
          blocks: blocks("Unpermitted publication"),
        }),
      ).rejects.toThrow();
      const row = await db.homepagePreview.findFirstOrThrow({
        where: { ownerId: scoped },
      });
      expect(row.channelHash).not.toBe(channel);
      expect(row.channelHash).toHaveLength(64);
    });
    it("rejects owner impersonation, global scope widening and mismatched/disabled display markets", async () => {
      const channel = randomUUID();
      await prepareHomepagePreview(scoped, input(channel));
      await expect(readHomepagePreview(owner, channel)).rejects.toThrow();
      await expect(
        prepareHomepagePreview(owner, input(channel, 2)),
      ).rejects.toThrow();
      await expect(
        prepareHomepagePreview(scoped, {
          ...input(randomUUID()),
          scopeMarketId: null,
        }),
      ).rejects.toThrow();
      await expect(
        prepareHomepagePreview(scoped, {
          ...input(randomUUID()),
          marketId: otherMarket,
        }),
      ).rejects.toThrow();
      await expect(
        prepareHomepagePreview(scoped, {
          ...input(randomUUID()),
          marketId: "missing",
        }),
      ).rejects.toThrow();
      const own = randomUUID();
      await prepareHomepagePreview(owner, input(own));
      try {
        await expect(
          prepareHomepagePreview(owner, {
            ...input(own, 2),
            scopeMarketId: null,
          }),
        ).rejects.toThrow();
      } finally {
        await db.homepagePreview.deleteMany({
          where: {
            channelHash: createHash("sha256").update(own).digest("hex"),
            ownerId: owner,
          },
        });
      }
    });
    it("keeps the newest sequence and content after concurrent updates and rejects a delayed older request", async () => {
      const channel = randomUUID();
      await prepareHomepagePreview(scoped, input(channel));
      await Promise.all([
        prepareHomepagePreview(scoped, input(channel, 3)),
        prepareHomepagePreview(scoped, input(channel, 2)),
      ]);
      const late = await prepareHomepagePreview(scoped, input(channel, 1));
      expect(late).toEqual({ accepted: false, sequence: 3 });
      const snapshot = await readHomepagePreview(scoped, channel);
      expect(snapshot.sequence).toBe(3);
      expect(snapshot.blocks[0]).toMatchObject({ text: { en: "Draft 3" } });
    });
    it("expires private snapshots and revokes access immediately when the actual scoped role is removed", async () => {
      const channel = randomUUID();
      await prepareHomepagePreview(scoped, input(channel));
      await db.homepagePreview.update({
        where: {
          channelHash: createHash("sha256").update(channel).digest("hex"),
        },
        data: { expiresAt: new Date("2000-01-01T00:00:00Z") },
      });
      await expect(readHomepagePreview(scoped, channel)).rejects.toThrow();
      await prepareHomepagePreview(scoped, input(channel, 2));
      const assignment = await db.userRole.findFirstOrThrow({
        where: { userId: scoped },
      });
      await db.userRole.delete({ where: { id: assignment.id } });
      try {
        await expect(readHomepagePreview(scoped, channel)).rejects.toThrow();
        await expect(
          prepareHomepagePreview(scoped, input(channel, 3)),
        ).rejects.toThrow();
      } finally {
        const { id, ...data } = assignment;
        await db.userRole.create({
          data: { ...data, id, scope: { marketId } },
        });
      }
    });
    it("serializes the technical per-owner active-preview bound under concurrent new channels", async () => {
      const attempts = await Promise.allSettled(
        Array.from({ length: 25 }, () =>
          prepareHomepagePreview(quotaUser, input(randomUUID())),
        ),
      );
      expect(
        attempts.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(20);
      expect(
        attempts.filter((result) => result.status === "rejected"),
      ).toHaveLength(5);
      expect(
        await db.homepagePreview.count({ where: { ownerId: quotaUser } }),
      ).toBe(20);
    });
  },
);
