import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId } } : null),
}));
import { db } from "@/lib/db";
import { can } from "@/modules/access";
import {
  createUser,
  setUserActive,
} from "@/app/admin/(dashboard)/users/actions";
import {
  saveRole,
  saveOverride,
} from "@/app/admin/(dashboard)/security/roles/actions";
import { revokeSession } from "@/app/admin/(dashboard)/security/actions";
async function user(roleKey: string) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  return db.user.create({
    data: {
      email: `security-action-${randomUUID()}@example.com`,
      name: roleKey,
      passwordHash: "unused",
      roles: { create: { roleId: role.id } },
    },
  });
}
function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
afterEach(() => {
  state.userId = null;
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "real security server-action boundaries",
  () => {
    it("rejects forged role management and user creation by every lower-privilege role", async () => {
      for (const role of [
        "admin",
        "warehouse",
        "accountant",
        "support",
        "data_entry",
        "marketing",
      ]) {
        const actor = await user(role);
        state.userId = actor.id;
        await expect(
          saveRole(form({ key: "forged", name: "forged" })),
        ).rejects.toThrow("FORBIDDEN");
        await expect(
          saveOverride(
            form({
              userId: actor.id,
              permission: "security.role.manage",
              mode: "allow",
            }),
          ),
        ).rejects.toThrow("FORBIDDEN");
        if (role !== "admin")
          await expect(createUser(new FormData())).rejects.toThrow("FORBIDDEN");
      }
      state.userId = null;
      await expect(saveRole(new FormData())).rejects.toThrow("UNAUTHENTICATED");
    });
    it("a users.manage administrator cannot create or disable an owner", async () => {
      const admin = await user("admin"),
        owner = await user("owner");
      state.userId = admin.id;
      const email = `escalation-${randomUUID()}@example.com`;
      await expect(
        createUser(
          form({
            email,
            name: "forged owner",
            password: "StrongTest123!",
            roleKey: "owner",
          }),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(await db.user.count({ where: { email } })).toBe(0);
      await expect(setUserActive(owner.id, false)).rejects.toThrow("FORBIDDEN");
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive,
      ).toBe(true);
    });
    it("role changes revoke sessions and audit within the same transaction", async () => {
      const owner = await user("owner");
      state.userId = owner.id;
      const key = `test_${randomUUID().replaceAll("-", "")}`;
      const input = form({ key, name: "Test role" });
      input.append("permissions", "catalog.product.view");
      await saveRole(input);
      const role = await db.role.findUniqueOrThrow({ where: { key } });
      const target = await db.user.create({
        data: {
          email: `role-${randomUUID()}@example.com`,
          name: "Role target",
          passwordHash: "unused",
          roles: { create: { roleId: role.id } },
        },
      });
      const session = await db.adminSession.create({
        data: {
          userId: target.id,
          sessionVersion: 0,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const change = form({ id: role.id, key, name: "Updated" });
      change.append("permissions", "order.view");
      await saveRole(change);
      expect(
        (await db.adminSession.findUniqueOrThrow({ where: { id: session.id } }))
          .revokedAt,
      ).not.toBeNull();
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: target.id } }))
          .sessionVersion,
      ).toBe(1);
      expect(await can(target.id, "catalog.product.view")).toBe(false);
      expect(await can(target.id, "order.view")).toBe(true);
      expect(
        await db.auditLog.count({
          where: { entityId: role.id, action: "security.role.updated" },
        }),
      ).toBe(2);
    });
    it("scoped overrides deny only their own market and may not alter owners", async () => {
      const owner = await user("owner"),
        target = await user("support");
      state.userId = owner.id;
      const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } }),
        ca = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
      await saveOverride(
        form({
          userId: target.id,
          permission: "order.view",
          mode: "deny",
          marketId: tr.id,
        }),
      );
      expect(await can(target.id, "order.view", { marketId: tr.id })).toBe(
        false,
      );
      expect(await can(target.id, "order.view", { marketId: ca.id })).toBe(
        true,
      );
      await expect(
        saveOverride(
          form({
            userId: owner.id,
            permission: "security.role.manage",
            mode: "deny",
          }),
        ),
      ).rejects.toThrow("OWNER_OVERRIDE_FORBIDDEN");
    });
    it("delegated role managers cannot remove their own deny to regain access", async () => {
      const actor = await user("admin");
      state.userId = actor.id;
      await db.userPermissionOverride.createMany({
        data: [
          { userId: actor.id, permission: "security.role.manage", allow: true },
          { userId: actor.id, permission: "order.view", allow: false },
        ],
      });
      await expect(
        saveOverride(
          form({ userId: actor.id, permission: "order.view", mode: "remove" }),
        ),
      ).rejects.toThrow("FORBIDDEN");
      expect(await can(actor.id, "order.view")).toBe(false);
    });
    it("a manager with a market deny cannot delegate that permission globally", async () => {
      const actor = await user("admin");
      state.userId = actor.id;
      const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } });
      await db.userPermissionOverride.createMany({
        data: [
          { userId: actor.id, permission: "security.role.manage", allow: true },
          {
            userId: actor.id,
            permission: "order.view",
            allow: false,
            scope: { marketId: tr.id },
          },
        ],
      });
      expect(await can(actor.id, "order.view")).toBe(true);
      const input = form({
        key: `deny_${randomUUID().replaceAll("-", "")}`,
        name: "Forbidden grant",
      });
      input.append("permissions", "order.view");
      await expect(saveRole(input)).rejects.toThrow("FORBIDDEN");
    });
    it("a user may revoke their own session but cannot revoke another user's session", async () => {
      const a = await user("warehouse"),
        b = await user("support");
      state.userId = a.id;
      const other = await db.adminSession.create({
        data: {
          userId: b.id,
          sessionVersion: 0,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await expect(revokeSession(form({ id: other.id }))).rejects.toThrow(
        "FORBIDDEN",
      );
      expect(
        (await db.adminSession.findUniqueOrThrow({ where: { id: other.id } }))
          .revokedAt,
      ).toBeNull();
      state.userId = b.id;
      await revokeSession(form({ id: other.id }));
      expect(
        (await db.adminSession.findUniqueOrThrow({ where: { id: other.id } }))
          .revokedAt,
      ).not.toBeNull();
    });
  },
);
