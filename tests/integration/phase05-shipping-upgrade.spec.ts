import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
const sql = readFileSync(
  "prisma/migrations/20260910183000_phase05_shipping/migration.sql",
  "utf8",
);
// The deployed fresh schema is checked by migrate deploy. Execute the exact
// data-upgrade section against temporary existing-market/role fixtures too.
const upgrade = sql.slice(sql.indexOf("-- Initial editable configuration."));
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "shipping upgrade without reseeding",
  () => {
    it("backfills market routes and role permissions on existing data", async () => {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE "Market" (id text,code text) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE "Role" (id text,key text) ON COMMIT DROP',
        );
        for (const table of [
          "RolePermission",
          "ShippingWorkflow",
          "ShippingLegTemplate",
        ]) {
          await tx.$executeRawUnsafe(
            `CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`,
          );
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "Market" VALUES ('tr','TR'),('ir','IR'),('ca','CA')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Role" VALUES ('admin','admin'),('warehouse','warehouse'),('support','support')`,
        );
        for (const statement of upgrade
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean))
          await tx.$executeRawUnsafe(statement);
        const defaults = await tx.$queryRaw<
          Array<{ marketId: string; count: bigint }>
        >`SELECT "marketId",count(*) FROM "ShippingWorkflow" WHERE "isDefault" GROUP BY "marketId" ORDER BY "marketId"`;
        expect(defaults).toEqual([
          { marketId: "ca", count: 1n },
          { marketId: "ir", count: 1n },
          { marketId: "tr", count: 1n },
        ]);
        const legs = await tx.$queryRaw<
          Array<{ workflowId: string; type: string }>
        >`SELECT "workflowId",type FROM "ShippingLegTemplate" ORDER BY "workflowId","sortOrder"`;
        expect(legs.map((l) => [l.workflowId, l.type])).toEqual([
          ["shipping-default-ca", "INTERNATIONAL"],
          ["shipping-default-ca", "DOMESTIC"],
          ["shipping-default-ir", "INTERNATIONAL"],
          ["shipping-default-ir", "DOMESTIC"],
          ["shipping-default-tr", "DOMESTIC"],
          ["shipping-door-ca", "INTERNATIONAL"],
        ]);
        const grants = await tx.$queryRaw<
          Array<{ roleId: string; permission: string }>
        >`SELECT "roleId",permission FROM "RolePermission" ORDER BY "roleId",permission`;
        expect(grants).toEqual([
          { roleId: "admin", permission: "order.shipment.manage" },
          { roleId: "admin", permission: "shipping.workflow.manage" },
          { roleId: "warehouse", permission: "order.shipment.manage" },
        ]);
      });
    });
  },
);
