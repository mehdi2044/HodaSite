import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId } } : null),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
import { db } from "@/lib/db";
import {
  adminOrder,
  approvePayment,
  cancelOrder,
  extendOrderHold,
  rejectPayment,
} from "@/modules/orders/service";
import { orderAction } from "@/app/admin/(dashboard)/orders/actions";
import { returnFixture } from "../helpers/returns";
afterEach(() => {
  state.userId = null;
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "order query scope and existence privacy",
  () => {
    it("TR-scoped administrator reads/edits TR and uniformly denies IR and nonexistent orders", async () => {
      const tr = await returnFixture(db, { code: "TR" }),
        ir = await returnFixture(db, { code: "IR" });
      const role = await db.role.findUniqueOrThrow({ where: { key: "admin" } });
      const user = await db.user.create({
        data: {
          email: `scope-${randomUUID()}@example.com`,
          name: "Scoped admin",
          passwordHash: "unused",
          roles: {
            create: { roleId: role.id, scope: { marketId: tr.order.marketId } },
          },
        },
      });
      expect((await adminOrder(tr.order.number, user.id)).id).toBe(tr.order.id);
      for (const number of [ir.order.number, "99999999999"])
        await expect(adminOrder(number, user.id)).rejects.toThrow("FORBIDDEN");
      for (const id of [ir.order.id, "unknown"]) {
        for (const call of [
          () => approvePayment(id, user.id),
          () => approvePayment(id, user.id, true),
          () => rejectPayment(id, user.id, "test"),
          () => cancelOrder(id, "test", user.id),
          () => extendOrderHold(id, user.id, 1),
        ])
          await expect(call()).rejects.toThrow("FORBIDDEN");
      }
      state.userId = user.id;
      const form = (id: string) => {
        const f = new FormData();
        f.set("orderId", id);
        f.set("operation", "note");
        f.set("reason", "scoped note");
        return f;
      };
      expect(await orderAction(form(tr.order.id))).toEqual({ ok: true });
      for (const id of [ir.order.id, "unknown"])
        expect(await orderAction(form(id))).toEqual({ error: "FORBIDDEN" });
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: ir.order.id } }))
          .adminNote,
      ).not.toBe("scoped note");
    });
    it("denies inactive and nonexistent subjects before order data is returned", async () => {
      const fixture = await returnFixture(db);
      const role = await db.role.findUniqueOrThrow({ where: { key: "owner" } });
      const user = await db.user.create({
        data: {
          email: `inactive-${randomUUID()}@example.com`,
          name: "Inactive",
          isActive: false,
          passwordHash: "unused",
          roles: { create: { roleId: role.id } },
        },
      });
      for (const subject of [user.id, "missing", ""])
        for (const number of [fixture.order.number, "unknown"])
          await expect(adminOrder(number, subject)).rejects.toThrow(
            "FORBIDDEN",
          );
    });
  },
);
