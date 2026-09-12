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
      const owner = await db.user.findFirstOrThrow({
        where: { roles: { some: { role: { key: "owner" } } }, isActive: true },
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
