import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  saveServicePolicy,
  currentServicePolicy,
} from "@/modules/content/service-policy";
import { setMaintenanceFlag } from "@/modules/settings";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R3b one actual market service source: live thresholds, returns, scope and version conflicts",
  () => {
    let owner = "",
      scoped = "",
      marketId = "",
      foreign = "",
      ruleId = "";
    let original: Awaited<ReturnType<typeof db.market.findUniqueOrThrow>>;
    const text = { fa: "خدمات آزمون", tr: "Deneme", en: "Fixture service" };
    const policy = () => ({
      version: 1 as const,
      announcement: true,
      shippingRuleIds: [ruleId],
      shipping: { title: text, body: text },
      returns: { title: text, body: text },
      prices: { title: text, body: text },
      support: { title: text, body: text },
    });
    beforeAll(async () => {
      setMaintenanceFlag(false);
      owner = (
        await db.user.findUniqueOrThrow({
          where: { email: process.env.ADMIN_EMAIL ?? "owner@example.com" },
        })
      ).id;
      original = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      marketId = original.id;
      foreign = (await db.market.findUniqueOrThrow({ where: { code: "TR" } }))
        .id;
      const role = await db.role.create({
        data: {
          key: `policy-${randomUUID()}`,
          nameI18n: text,
          permissions: { create: [{ permission: "markets.edit" }] },
        },
      });
      scoped = (
        await db.user.create({
          data: {
            email: `policy-${randomUUID()}@example.com`,
            passwordHash: "invalid-fixture-hash",
            name: "Scoped policy fixture",
            roles: { create: [{ roleId: role.id, scope: { marketId } }] },
          },
        })
      ).id;
      ruleId = (
        await db.feeRule.create({
          data: {
            marketId,
            labelI18n: text,
            type: "SHIPPING",
            method: "FIXED",
            params: { amount: "0" },
            currency: original.currency,
            minAmount: "100.0001",
            absorb: true,
            validFrom: new Date("2020-01-01T00:00:00Z"),
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (marketId)
        await db.market.update({
          where: { id: marketId },
          data: {
            servicePolicy:
              original.servicePolicy === null
                ? Prisma.DbNull
                : (original.servicePolicy as Prisma.InputJsonValue),
            returnSettings: original.returnSettings as Prisma.InputJsonValue,
          },
        });
      if (ruleId)
        await db.feeRule.update({
          where: { id: ruleId },
          data: { isActive: false },
        });
      if (scoped)
        await db.user.update({
          where: { id: scoped },
          data: { isActive: false },
        });
    });
    it("stores only copy/reference configuration and resolves the live fee and return values", async () => {
      const parsed = await currentServicePolicy(marketId),
        revision = parsed?.policy?.revision ?? 0;
      await saveServicePolicy(scoped, {
        marketId,
        expectedRevision: revision,
        policy: policy(),
      });
      expect(
        (await currentServicePolicy(marketId))?.rules.find(
          (rule) => rule.id === ruleId,
        )?.minAmount,
      ).toBe("100.0001");
      await db.feeRule.update({
        where: { id: ruleId },
        data: { minAmount: "250.0001" },
      });
      await db.market.update({
        where: { id: marketId },
        data: {
          returnSettings: { enabled: true, days: 21, excludedCategoryIds: [] },
        },
      });
      const current = await currentServicePolicy(marketId);
      expect(current?.rules[0].minAmount).toBe("250.0001");
      expect(current?.returns?.days).toBe(21);
      const raw = (
        await db.market.findUniqueOrThrow({ where: { id: marketId } })
      ).servicePolicy!;
      expect(JSON.stringify(raw)).not.toContain("250.0001");
      expect(JSON.stringify(raw)).not.toContain('"days"');
      await db.feeRule.update({
        where: { id: ruleId },
        data: { validUntil: new Date("2021-01-01T00:00:00Z") },
      });
      expect((await currentServicePolicy(marketId))?.rules).toHaveLength(0);
    });
    it("denies foreign scopes/references and has one winner/audit for concurrent matching revisions", async () => {
      const revision = (await currentServicePolicy(marketId))!.policy!.revision;
      await expect(
        saveServicePolicy(scoped, {
          marketId: foreign,
          expectedRevision: 0,
          policy: policy(),
        }),
      ).rejects.toThrow();
      await expect(
        saveServicePolicy(owner, {
          marketId: foreign,
          expectedRevision: 0,
          policy: policy(),
        }),
      ).rejects.toThrow();
      const before = await db.auditLog.count({
        where: { entityId: marketId, action: "markets.service-policy.updated" },
      });
      const results = await Promise.allSettled([
        saveServicePolicy(scoped, {
          marketId,
          expectedRevision: revision,
          policy: policy(),
        }),
        saveServicePolicy(scoped, {
          marketId,
          expectedRevision: revision,
          policy: policy(),
        }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect((await currentServicePolicy(marketId))?.policy?.revision).toBe(
        revision + 1,
      );
      expect(
        await db.auditLog.count({
          where: {
            entityId: marketId,
            action: "markets.service-policy.updated",
          },
        }),
      ).toBe(before + 1);
    });
  },
);
