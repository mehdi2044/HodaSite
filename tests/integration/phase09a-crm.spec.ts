import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
const actor = vi.hoisted(() => ({ admin: "", customer: "" }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (actor.admin ? { user: { id: actor.admin } } : null),
}));
vi.mock("@/modules/customers", () => ({
  currentCustomer: async () => {
    const { db } = await import("@/lib/db");
    return actor.customer
      ? db.customer.findFirst({ where: { id: actor.customer, isActive: true } })
      : null;
  },
}));
import { db } from "@/lib/db";
import { segmentQuery } from "@/modules/crm/segment-query";
import { setMaintenanceFlag } from "@/modules/settings";
import { seal } from "@/lib/secure-tokens";
import {
  customer360,
  listCustomers,
  addNote,
  setTags,
  saveMetricsConfig,
  previewSegment,
  saveSegment,
  listSegments,
  setPreference,
  preferences,
  hasMarketingConsent,
  createUnsubscribeToken,
  readUnsubscribeToken,
  unsubscribeEmail,
  requestPrivacy,
  transitionPrivacy,
  privacyRequests,
  exportPersonalData,
} from "@/modules/crm";
import { noteAction, segmentAction } from "@/app/admin/(dashboard)/crm/actions";
import { GET as exportRoute } from "@/app/api/crm/export/[id]/route";
const suffix = randomUUID().slice(0, 8),
  SUBJECTS = [
    "owner",
    "allowed",
    "wrong-market",
    "denied",
    "inactive",
    "anonymous",
  ] as const;
const permissions = [
  "crm.customer.view",
  "crm.customer.notes",
  "crm.customer.tags",
  "crm.segment.manage",
  "crm.privacy.review",
  "crm.customer.export",
  "crm.metrics.manage",
];
let marketId = "",
  otherMarket = "",
  customerId = "",
  otherCustomer = "",
  owner = "",
  categoryId = "";
const users: Record<string, string> = {};
const definition = { version: 1 as const, rules: [] };
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "Phase09A privacy, SQL truth and permission × market",
  () => {
    beforeAll(async () => {
      setMaintenanceFlag(false);
      process.env.AUTH_SECRET = "crm-test-secret";
      for (const key of ["a", "b"]) {
        const m = await db.market.create({
          data: {
            code: `CRM${key}${suffix}`,
            name: "CRM fixture",
            currency: "USD",
            defaultLocale: "en",
            enabledLocales: ["en", "fa", "tr"],
            roundingRule: {},
            holdHours: 1,
            paymentDeadlineHours: 24,
            fxMode: "AUTO_ACCEPT",
          },
        });
        if (key === "a") marketId = m.id;
        else otherMarket = m.id;
      }
      const c = await db.customer.create({
        data: {
          email: `crm-${suffix}@example.com`,
          firstName: "Fixture",
          locale: "en",
          preferredMarketId: marketId,
          isGuest: false,
        },
      });
      customerId = c.id;
      otherCustomer = (
        await db.customer.create({
          data: {
            email: `crm-other-${suffix}@example.com`,
            preferredMarketId: otherMarket,
          },
        })
      ).id;
      for (const subject of SUBJECTS.filter((s) => s !== "anonymous")) {
        const u = await db.user.create({
          data: {
            email: `crm-${subject}-${suffix}@example.com`,
            name: "CRM fixture",
            passwordHash: "unused-test-fixture",
            isActive: subject !== "inactive",
          },
        });
        users[subject] = u.id;
        if (subject === "owner") {
          owner = u.id;
          await db.userRole.create({
            data: {
              userId: u.id,
              roleId: (
                await db.role.findUniqueOrThrow({ where: { key: "owner" } })
              ).id,
            },
          });
        } else if (subject !== "denied")
          await db.userPermissionOverride.createMany({
            data: permissions.map((permission) => ({
              userId: u.id,
              permission,
              allow: true,
              scope: {
                marketId: subject === "wrong-market" ? otherMarket : marketId,
              },
            })),
          });
      }
      const variant = await db.variant.findFirstOrThrow({
        include: { product: true },
      });
      categoryId = variant.product.categoryId;
      for (const [index, amount] of ["10.0001", "20.0002"].entries()) {
        const cart = await db.cart.create({
          data: {
            tokenHash: randomUUID(),
            customerId,
            marketId,
            locale: "en",
            currency: "USD",
            expiresAt: new Date("2030-01-01"),
          },
        });
        await db.order.create({
          data: {
            number: `CRM-${suffix}-${index}`,
            cartId: cart.id,
            customerId,
            marketId,
            guestTokenHash: "fixture",
            status: "PAID",
            kind: "SALE",
            locale: "en",
            currency: "USD",
            subtotalAmount: amount,
            feeTotalAmount: 0,
            totalAmount: amount,
            totalAmountUsd: amount,
            totalAmountTry: amount,
            fxSnapshot: {},
            bankSnapshot: {},
            contactSnapshot: { private: "MUST_NOT_LEAK" },
            shippingAddress: {},
            billingAddress: {},
            holdExpiresAt: new Date("2030-01-01"),
            paymentDeadlineAt: new Date("2030-01-01"),
            paidAt: new Date("2026-01-01"),
            items: {
              create: {
                variantId: variant.id,
                productSnapshot: {},
                unitPriceAmount: amount,
                currency: "USD",
                quantity: 1,
                lineTotalAmount: amount,
                weightGrams: 1,
              },
            },
          },
        });
      }
    });
    beforeEach(() => {
      actor.admin = owner;
      actor.customer = customerId;
    });
    for (const subject of SUBJECTS)
      for (const permission of permissions)
        it(`${subject} / ${permission} / server operation`, async () => {
          actor.admin = users[subject] ?? "";
          const op =
            permission === "crm.customer.view"
              ? () => customer360(marketId, customerId)
              : permission === "crm.customer.notes"
                ? () =>
                    addNote({
                      customerId,
                      marketId,
                      body: "Matrix internal note",
                    })
                : permission === "crm.customer.tags"
                  ? () => setTags({ customerId, marketId, tags: ["matrix"] })
                  : permission === "crm.segment.manage"
                    ? () =>
                        saveSegment({
                          marketId,
                          name: "Matrix segment",
                          definition,
                        })
                    : permission === "crm.metrics.manage"
                      ? () =>
                          saveMetricsConfig({
                            marketId,
                            definition: {
                              name: "Matrix",
                              recencyDays: [30, 60, 90, 180],
                              frequency: [1, 3, 5, 10],
                              monetaryUsd: ["50", "100", "250", "500"],
                              churnDays: 180,
                            },
                          })
                      : permission === "crm.privacy.review"
                        ? () => privacyRequests(marketId, 0, true)
                        : async () => {
                            // Export permission is exercised through the real approval transition, with privacy.review granted independently.
                            const req = await db.privacyRequest.create({
                              data: {
                                customerId,
                                marketId,
                                kind: "EXPORT",
                                status: "IN_REVIEW",
                              },
                            });
                            return transitionPrivacy({
                              id: req.id,
                              marketId,
                              version: 1,
                              status: "APPROVED",
                            });
                          };
          if (["owner", "allowed"].includes(subject)) await op();
          else
            await expect(op()).rejects.toThrow(
              subject === "anonymous" ? "UNAUTHENTICATED" : "FORBIDDEN",
            );
        });
    it("denies known IDs outside market and rejects caller-supplied actor on domain mutations", async () => {
      await expect(customer360(marketId, otherCustomer)).rejects.toThrow(
        "FORBIDDEN",
      );
      await expect(
        addNote({ customerId, marketId, body: "x", actorId: owner }),
      ).rejects.toThrow();
      actor.admin = users.denied;
      const f = new FormData();
      Object.entries({
        customerId,
        marketId,
        body: "forged",
        actorId: owner,
      }).forEach(([k, v]) => f.set(k, v));
      expect(await noteAction(null, f)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
    });
    it("CRM minimizes fields and computes frozen decimal historical value", async () => {
      const d = await customer360(marketId, customerId);
      expect(d.metrics).toMatchObject({
        orders: 2,
        valueUsd: "30.0003",
        aovUsd: "15.0002",
      });
      expect(JSON.stringify(d)).not.toMatch(
        /MUST_NOT_LEAK|guestTokenHash|tokenHash|sessionVersion|mfaSecret/,
      );
      expect((await listCustomers(marketId)).map((c) => c.id)).not.toContain(
        otherCustomer,
      );
    });
    it("never reads legacy unverified JSON as consent and serializes first consent writes", async () => {
      await db.customer.update({
        where: { id: customerId },
        data: { marketingConsent: { email: true } },
      });
      expect(await hasMarketingConsent(customerId, marketId, "email")).toBe(
        false,
      );
      await Promise.all([
        setPreference({ marketId, channel: "email", status: "OPTED_IN" }),
        setPreference({ marketId, channel: "email", status: "OPTED_IN" }),
      ]);
      expect(
        await db.consentEvent.count({
          where: { customerId, marketId, channel: "email" },
        }),
      ).toBe(1);
      expect(await hasMarketingConsent(customerId, otherMarket, "email")).toBe(
        false,
      );
      await expect(
        setPreference({
          marketId,
          channel: "sms",
          status: "OPTED_IN",
          customerId: otherCustomer,
          ip: "127.0.0.1",
        }),
      ).rejects.toThrow();
    });
    it("purpose-bound expiring unsubscribe revokes eligibility without a session and old links cannot override reconsent", async () => {
      const token = await createUnsubscribeToken(marketId);
      expect(token).toBeTruthy();
      actor.customer = "";
      await unsubscribeEmail(token);
      expect(await hasMarketingConsent(customerId, marketId, "email")).toBe(
        false,
      );
      actor.customer = customerId;
      await setPreference({ marketId, channel: "email", status: "OPTED_IN" });
      await expect(unsubscribeEmail(token)).rejects.toThrow("FORBIDDEN");
      for (const value of [
        token + "broken",
        seal({
          purpose: "login",
          customerId,
          marketId,
          version: 1,
          expires: Date.now() + 1000,
        }),
        seal({
          purpose: "crm-email-unsubscribe-v1",
          customerId,
          marketId,
          version: 1,
          expires: Date.now() - 1000,
        }),
      ])
        expect(() => readUnsubscribeToken(value)).toThrow("FORBIDDEN");
      await setPreference({ marketId, channel: "email", status: "OPTED_OUT" });
      expect(await hasMarketingConsent(customerId, marketId, "email")).toBe(
        false,
      );
    });
    it("matches independently written SQL ground truth for each segment dimension and intersections", async () => {
      await setTags({ marketId, customerId, tags: ["vip"] });
      const cases = [
        { field: "market", value: marketId },
        { field: "locale", value: "en" },
        { field: "orders", op: "gte", value: 2 },
        { field: "value", op: "gte", value: "30.0003" },
        { field: "aov", op: "gte", value: "15.0001" },
        { field: "lastOrder", op: "gte", value: "2026-01-01" },
        { field: "category", value: categoryId },
        { field: "tag", value: "vip" },
        { field: "consent", channel: "email", value: "OPTED_OUT" },
      ];
      const truth = await db.$queryRaw<
        { n: bigint }[]
      >`SELECT count(DISTINCT c.id) n FROM "Customer" c JOIN "Order" o ON o."customerId"=c.id WHERE c."preferredMarketId"=${marketId} AND o."marketId"=${marketId} AND o."paidAt" IS NOT NULL`;
      for (const rule of cases)
        expect(
          (await previewSegment(marketId, { version: 1, rules: [rule] })).count,
        ).toBe(Number(truth[0].n));
      expect(
        (await previewSegment(marketId, { version: 1, rules: cases })).count,
      ).toBe(1);
      expect(
        (
          await previewSegment(marketId, {
            version: 1,
            rules: [{ field: "consent", channel: "sms", value: "UNKNOWN" }],
          })
        ).count,
      ).toBe(1);
      expect(
        (
          await previewSegment(marketId, {
            version: 1,
            rules: [{ field: "market", value: otherMarket }],
          })
        ).count,
      ).toBe(0);
    });
    it("rejects stale segment revisions and keeps count-preview contact-free", async () => {
      const sid = await saveSegment({
        marketId,
        name: "Versioned",
        definition,
      });
      await saveSegment({
        id: sid,
        version: 1,
        marketId,
        name: "Revised",
        definition,
      });
      await expect(
        saveSegment({
          id: sid,
          version: 1,
          marketId,
          name: "Stale",
          definition,
        }),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        await db.crmSegmentRevision.count({ where: { segmentId: sid } }),
      ).toBe(2);
      expect((await listSegments(marketId)).length).toBeGreaterThan(0);
      const preview = await previewSegment(marketId, definition);
      expect(Object.keys(preview.rows[0]).sort()).toEqual(["id", "locale"]);
      const f = new FormData();
      f.set("marketId", marketId);
      f.set("definition", "invalid-json");
      expect(await segmentAction(null, f)).toMatchObject({
        ok: false,
        code: "VALIDATION",
      });
    });
    it("requests require review, bind to customer, and DELETE approval never erases data", async () => {
      const [a, b] = await Promise.all([
        requestPrivacy({ marketId, kind: "DELETE" }),
        requestPrivacy({ marketId, kind: "DELETE" }),
      ]);
      expect(a.id).toBe(b.id);
      await expect(
        transitionPrivacy(
          { id: a.id, marketId, version: 1, status: "APPROVED" },
          true,
        ),
      ).rejects.toThrow("FORBIDDEN");
      await transitionPrivacy({
        id: a.id,
        marketId,
        version: 1,
        status: "IN_REVIEW",
      });
      await transitionPrivacy({
        id: a.id,
        marketId,
        version: 2,
        status: "APPROVED",
      });
      expect(
        await db.customer.findUnique({ where: { id: customerId } }),
      ).not.toBeNull();
      expect(await db.order.count({ where: { customerId } })).toBe(2);
    });
    it("exports are reviewed, private/no-store, self-only and exclude internal notes", async () => {
      const r = await requestPrivacy({ marketId, kind: "EXPORT" });
      await expect(exportPersonalData(r.id)).rejects.toThrow("FORBIDDEN");
      if (r.status === "REQUESTED")
        await transitionPrivacy({
          id: r.id,
          marketId,
          version: 1,
          status: "IN_REVIEW",
        });
      await transitionPrivacy({
        id: r.id,
        marketId,
        version: r.status === "REQUESTED" ? 2 : r.version,
        status: "APPROVED",
      });
      const response = await exportRoute(
        new Request("http://localhost/api/crm/export/fixture"),
        { params: Promise.resolve({ id: r.id }) },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const text = await response.text();
      expect(text).not.toMatch(/Matrix internal|MUST_NOT_LEAK|sessionVersion/);
      actor.customer = otherCustomer;
      await expect(exportPersonalData(r.id)).rejects.toThrow("FORBIDDEN");
      actor.customer = "";
      await expect(preferences(marketId)).rejects.toThrow("UNAUTHENTICATED");
    });
    it("export approval needs export permission in addition to privacy review", async () => {
      actor.admin = users.allowed;
      await db.userPermissionOverride.updateMany({
        where: { userId: users.allowed, permission: "crm.customer.export" },
        data: { allow: false },
      });
      const r = await db.privacyRequest.create({
        data: { customerId, marketId, kind: "EXPORT", status: "IN_REVIEW" },
      });
      try {
        await expect(
          transitionPrivacy({
            id: r.id,
            marketId,
            version: 1,
            status: "APPROVED",
          }),
        ).rejects.toThrow("crm.customer.export");
      } finally {
        await db.userPermissionOverride.updateMany({
          where: { userId: users.allowed, permission: "crm.customer.export" },
          data: { allow: true },
        });
      }
    });
    it("hides notes without the separate grant and paginates detail collections", async () => {
      await db.crmNote.createMany({
        data: Array.from({ length: 30 }, (_, i) => ({
          customerId,
          marketId,
          actorId: owner,
          body: `Paginated fixture ${i}`,
        })),
      });
      expect((await customer360(marketId, customerId)).notes).toHaveLength(26);
      expect(
        (await customer360(marketId, customerId, 1)).notes.length,
      ).toBeGreaterThan(0);
      actor.admin = users.allowed;
      await db.userPermissionOverride.updateMany({
        where: { userId: users.allowed, permission: "crm.customer.notes" },
        data: { allow: false },
      });
      try {
        expect((await customer360(marketId, customerId)).notes).toEqual([]);
      } finally {
        await db.userPermissionOverride.updateMany({
          where: { userId: users.allowed, permission: "crm.customer.notes" },
          data: { allow: true },
        });
      }
    });
    it("bounds a larger audience, retains stable pages and explains the SQL plan", async () => {
      await db.customer.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          email: `crm-scale-${suffix}-${i}@example.com`,
          preferredMarketId: otherMarket,
          locale: i % 2 ? "en" : "tr",
        })),
      });
      const def = {
        version: 1,
        rules: [{ field: "orders", op: "eq", value: 0 }],
      };
      const result = await previewSegment(otherMarket, def);
      const truth = await db.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) n FROM "Customer" c WHERE c."preferredMarketId"=${otherMarket} AND c."isActive" AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId"=c.id AND o."marketId"=${otherMarket} AND o."paidAt" IS NOT NULL AND o.kind='SALE' AND o.status <> 'CANCELLED')`;
      expect(result.count).toBe(Number(truth[0].n));
      expect(result.rows).toHaveLength(25);
      const second = await previewSegment(otherMarket, def, 1);
      expect(
        second.rows.every((r) => !result.rows.some((x) => x.id === r.id)),
      ).toBe(true);
      const predicate = segmentQuery(otherMarket, def);
      const plan =
        await db.$queryRaw`EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) ${predicate}`;
      expect(JSON.stringify(plan)).toContain("Execution Time");
      await expect(previewSegment(otherMarket, def, 1001)).rejects.toThrow();
    });
    it("evidence is immutable even through direct database mutations", async () => {
      const event = await db.consentEvent.findFirstOrThrow({
        where: { customerId },
      });
      await expect(
        db.consentEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow("append-only");
      const request = await db.privacyEvent.findFirstOrThrow({
        where: { request: { customerId } },
      });
      await expect(
        db.privacyEvent.update({
          where: { id: request.id },
          data: { status: "APPROVED" },
        }),
      ).rejects.toThrow("append-only");
    });
  },
);
