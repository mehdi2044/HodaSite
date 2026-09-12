import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { can, PERMISSIONS } from "@/modules/access";
import { previewRole } from "@/modules/access/preview";
import contract from "../fixtures/phase05-permission-contract.json";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "role preview and direct persisted permission decisions",
  () => {
    it("every seeded role matches the reviewed contract in preview and direct guards for TR/IR", async () => {
      const ownerRole = await db.role.findUniqueOrThrow({
        where: { key: "owner" },
      });
      // Other suites intentionally create scoped owners and denied overrides.
      // A random owner is therefore not a valid fixture for this global action.
      const owner = await db.user.create({
        data: {
          email: `preview-owner-${randomUUID()}@example.com`,
          name: "Preview owner",
          passwordHash: "unused",
          roles: { create: { roleId: ownerRole.id } },
        },
      });
      const tr = await db.market.findUniqueOrThrow({ where: { code: "TR" } }),
        ir = await db.market.findUniqueOrThrow({ where: { code: "IR" } });
      for (const [key, grants] of Object.entries(contract.roles)) {
        const role = await db.role.findUniqueOrThrow({ where: { key } });
        const user = await db.user.create({
          data: {
            email: `matrix-${randomUUID()}@example.com`,
            name: key,
            passwordHash: "unused",
            roles: { create: { roleId: role.id, scope: { marketId: tr.id } } },
          },
        });
        for (const market of [tr, ir]) {
          const rows = await previewRole(owner.id, {
            roleId: role.id,
            grant: { marketId: tr.id },
            target: { marketId: market.id },
          });
          expect(rows.map((r) => r.permission)).toEqual([...PERMISSIONS]);
          for (const row of rows) {
            const expected =
              market.id === tr.id &&
              (grants.includes("*") || grants.includes(row.permission));
            expect(row.allowed).toBe(expected);
            expect(
              await can(user.id, row.permission, { marketId: market.id }),
            ).toBe(expected);
          }
        }
      }
    }, 60000);
    it("denies preview to anonymous or unauthorized subjects before role lookup", async () => {
      const role = await db.role.findUniqueOrThrow({
        where: { key: "warehouse" },
      });
      const user = await db.user.create({
        data: {
          email: `preview-deny-${randomUUID()}@example.com`,
          name: "Warehouse",
          passwordHash: "unused",
          roles: { create: { roleId: role.id } },
        },
      });
      for (const actor of ["", user.id])
        for (const roleId of [role.id, "unknown"])
          await expect(
            previewRole(actor, { roleId, grant: {}, target: {} }),
          ).rejects.toThrow("FORBIDDEN");
    });
  },
);
