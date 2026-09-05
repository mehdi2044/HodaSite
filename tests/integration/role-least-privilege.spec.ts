import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Direct server-action check needs a controllable session.
const acting = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.userId ? { user: { id: acting.userId } } : null),
}));

import { db } from "@/lib/db";
import { can } from "@/modules/access";
import { saveTheme } from "@/app/admin/(dashboard)/settings/theme/actions";

// Global setup (tests/setup/global-setup.ts) already confirmed
// TEST_DATABASE_URL is reachable when set, or fails the whole run — so
// presence alone is enough here.
const hasDb = Boolean(process.env.TEST_DATABASE_URL);

// What each non-owner role MUST have (a sample) and MUST NOT have.
const EXPECT: Record<string, { allow: string[]; deny: string[] }> = {
  admin: {
    allow: ["users.manage", "catalog.product.publish", "pricing.cost.view"],
    deny: ["security.role.manage", "payment.refund", "finance.expense.create"],
  },
  data_entry: {
    allow: ["catalog.product.create", "media.upload"],
    deny: [
      "catalog.product.publish",
      "pricing.cost.view",
      "users.manage",
      "settings.theme.edit",
    ],
  },
  warehouse: {
    allow: ["inventory.stock.adjust", "order.view"],
    deny: ["pricing.sale_price.edit", "users.manage", "security.role.manage"],
  },
  accountant: {
    allow: ["finance.report.view", "pricing.cost.view", "payment.refund"],
    deny: ["catalog.product.edit", "users.manage", "settings.brand.edit"],
  },
  support: {
    allow: ["order.cancel", "crm.customer.export"],
    deny: [
      "security.role.manage",
      "pricing.sale_price.edit",
      "settings.theme.edit",
      "users.manage",
    ],
  },
  marketing: {
    allow: ["marketing.campaign.publish", "crm.customer.export"],
    deny: ["catalog.product.publish", "pricing.cost.view", "users.manage"],
  },
};

const userIds: Record<string, string> = {};

describe.skipIf(!hasDb)("least-privilege roles (C2)", () => {
  beforeAll(async () => {
    for (const key of Object.keys(EXPECT)) {
      const role = await db.role.findUniqueOrThrow({ where: { key } });
      const user = await db.user.create({
        data: {
          email: `lp-${key}-${Date.now()}@example.com`,
          name: key,
          passwordHash: "x",
          roles: { create: { roleId: role.id } },
        },
      });
      userIds[key] = user.id;
    }
  });

  afterAll(async () => {
    acting.userId = null;
    await db.user.deleteMany({
      where: { id: { in: Object.values(userIds) } },
    });
  });

  for (const [role, { allow, deny }] of Object.entries(EXPECT)) {
    it(`${role} has its permissions and only those`, async () => {
      for (const p of allow) {
        expect(await can(userIds[role], p), `${role} should allow ${p}`).toBe(
          true,
        );
      }
      for (const p of deny) {
        expect(await can(userIds[role], p), `${role} must NOT allow ${p}`).toBe(
          false,
        );
      }
    });
  }

  it("no non-owner role can manage roles/permissions", async () => {
    for (const role of Object.keys(EXPECT)) {
      expect(await can(userIds[role], "security.role.manage")).toBe(false);
    }
  });

  it("a warehouse user is refused by a real admin server action", async () => {
    acting.userId = userIds.warehouse;
    const fd = new FormData();
    fd.set("light_primary", "#ffffff");
    // assertCan() runs before field validation, so a minimal FormData is
    // enough — the action never reaches schema.parse for this role.
    const result = await saveTheme(null, fd);
    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: expect.any(String),
    });
    acting.userId = null;
  });
});
