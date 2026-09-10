import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (session.userId ? { user: { id: session.userId } } : null),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
import { db } from "@/lib/db";
import { unseal } from "@/lib/secure-tokens";
import { can } from "@/modules/access";
import {
  createShipment,
  changeShipment,
  shipmentInclude,
  shippingOrder,
} from "@/modules/shipping/service";
import { saveWorkflow, shippingMarkets } from "@/modules/shipping/workflows";
import { findPublicTracking } from "@/modules/shipping/tracking";
import {
  shipmentAction,
  workflowAction,
} from "@/app/admin/(dashboard)/settings/shipping/actions";
import {
  shippingFixture,
  shippingActor,
  shippingForm,
  legValues,
  workflowValues,
  labels,
} from "../helpers/shipping";
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
afterEach(() => {
  session.userId = null;
});
async function parcel(quantity = 2, code = "IR") {
  const f = await shippingFixture(db, code, quantity),
    actor = await shippingActor(db);
  const id = await createShipment(actor.id, f.order.id, [
    { orderItemId: f.order.items[0].id, quantity: 1 },
  ]);
  return { ...f, actor, id };
}
async function change(
  f: Awaited<ReturnType<typeof parcel>>,
  index: number,
  status: Parameters<typeof legValues>[0],
) {
  const s = await db.shipment.findUniqueOrThrow({
    where: { id: f.id },
    include: shipmentInclude,
  });
  await changeShipment(f.actor.id, f.order.id, s.id, s.version, "saveLeg", {
    ...legValues(status),
    legId: s.legs[index].id,
  });
}
describe.skipIf(!hasDb)("shipping transactions and public privacy", () => {
  it("seeds TR domestic and IR/CA two-leg routes plus optional CA door-to-door", async () => {
    for (const code of ["TR", "IR", "CA"]) {
      const workflow = await db.shippingWorkflow.findFirstOrThrow({
        where: { market: { code }, isDefault: true },
        include: { legs: { orderBy: { sortOrder: "asc" } } },
      });
      expect(workflow.legs.map((l) => l.type)).toEqual(
        code === "TR" ? ["DOMESTIC"] : ["INTERNATIONAL", "DOMESTIC"],
      );
    }
    expect(
      await db.shippingWorkflow.count({
        where: { market: { code: "CA" }, isActive: true },
      }),
    ).toBeGreaterThanOrEqual(2);
  });
  it("serializes concurrent allocation and retains cancelled allocation history", async () => {
    const f = await shippingFixture(db, "TR", 1),
      actor = await shippingActor(db);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        createShipment(actor.id, f.order.id, [
          { orderItemId: f.order.items[0].id, quantity: 1 },
        ]),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const s = await db.shipment.findFirstOrThrow({
      where: { orderId: f.order.id },
    });
    await changeShipment(actor.id, f.order.id, s.id, 0, "cancelShipment", {});
    await createShipment(actor.id, f.order.id, [
      { orderItemId: f.order.items[0].id, quantity: 1 },
    ]);
    expect(
      await db.shipmentItem.count({
        where: { shipment: { orderId: f.order.id } },
      }),
    ).toBe(2);
    await expect(
      db.shipmentItem.updateMany({
        where: { shipmentId: s.id },
        data: { quantity: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      db.shipmentItem.deleteMany({ where: { shipmentId: s.id } }),
    ).rejects.toThrow();
  });
  it("database rejects direct cross-order allocation and quantity overflow", async () => {
    const f = await parcel(1, "TR"),
      other = await shippingFixture(db, "TR", 1);
    const s = await db.shipment.findUniqueOrThrow({ where: { id: f.id } });
    const extra = await db.shipment.create({
      data: { orderId: f.order.id, workflowId: s.workflowId, nameI18n: labels },
    });
    await expect(
      db.shipmentItem.create({
        data: {
          shipmentId: extra.id,
          orderItemId: other.order.items[0].id,
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.shipmentItem.create({
        data: {
          shipmentId: extra.id,
          orderItemId: f.order.items[0].id,
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
    expect(
      await db.shipmentItem.count({ where: { shipmentId: extra.id } }),
    ).toBe(0);
  });
  it("requires earlier legs, protects dates/costs, and completes only after every item is delivered", async () => {
    const f = await parcel();
    const moneyBefore = f.order.totalAmount.toString();
    await expect(change(f, 1, "IN_TRANSIT")).rejects.toThrow(
      "SHIPPING_SEQUENCE",
    );
    await change(f, 0, "IN_TRANSIT");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
    ).toBe("SHIPPED");
    let s = await db.shipment.findUniqueOrThrow({
      where: { id: f.id },
      include: shipmentInclude,
    });
    await expect(
      changeShipment(f.actor.id, f.order.id, f.id, s.version, "saveLeg", {
        ...legValues(),
        legId: s.legs[0].id,
        costAmount: "99",
      }),
    ).rejects.toThrow("SHIPPING_COST_LOCKED");
    await expect(
      changeShipment(f.actor.id, f.order.id, f.id, s.version, "saveLeg", {
        ...legValues(),
        legId: s.legs[0].id,
        shippedAt: new Date(0),
      }),
    ).rejects.toThrow("SHIPPING_DATE");
    await expect(
      changeShipment(
        f.actor.id,
        f.order.id,
        f.id,
        s.version,
        "cancelShipment",
        {},
      ),
    ).rejects.toThrow("SHIPPING_STATE");
    await change(f, 0, "FAILED");
    await change(f, 0, "IN_TRANSIT");
    expect(
      (
        await db.trackingEvent.findMany({
          where: { legId: s.legs[0].id },
          orderBy: [{ at: "asc" }, { createdAt: "asc" }],
        })
      ).map((e) => e.status),
    ).toEqual(["IN_TRANSIT", "FAILED", "IN_TRANSIT"]);
    await change(f, 0, "DELIVERED");
    s = await db.shipment.findUniqueOrThrow({
      where: { id: f.id },
      include: shipmentInclude,
    });
    await expect(
      changeShipment(f.actor.id, f.order.id, f.id, s.version, "saveLeg", {
        ...legValues("DELIVERED"),
        legId: s.legs[0].id,
        carrierName: "forged",
      }),
    ).rejects.toThrow("SHIPPING_STATE");
    await change(f, 1, "IN_TRANSIT");
    await change(f, 1, "DELIVERED");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status,
    ).toBe("SHIPPED");
    const id = await createShipment(f.actor.id, f.order.id, [
      { orderItemId: f.order.items[0].id, quantity: 1 },
    ]);
    const second = { ...f, id };
    for (const i of [0, 1]) {
      await change(second, i, "IN_TRANSIT");
      await change(second, i, "DELIVERED");
    }
    const order = await db.order.findUniqueOrThrow({
      where: { id: f.order.id },
    });
    expect(order.status).toBe("DELIVERED");
    expect(order.totalAmount.toString()).toBe(moneyBefore);
    expect(
      await db.stockMovement.count({ where: { referenceId: f.order.id } }),
    ).toBe(0);
    expect(
      await db.orderEvent.count({
        where: { orderId: f.order.id, type: "SHIPPED" },
      }),
    ).toBe(1);
    expect(
      await db.orderEvent.count({
        where: { orderId: f.order.id, type: "DELIVERED" },
      }),
    ).toBe(1);
    const emails = (
      await db.job.findMany({ where: { type: "send-email" } })
    ).flatMap((job) => {
      const payload = job.payload as { encrypted?: string };
      if (!payload.encrypted) return [];
      try {
        const mail = unseal(payload.encrypted) as {
          to: string;
          templateKey: string;
        };
        return mail.to === f.email ? [mail.templateKey] : [];
      } catch {
        return [];
      }
    });
    expect(emails.sort()).toEqual(["order.delivered", "order.shipped"]);
  });
  it("rejects simultaneous stale updates without duplicate status emails/events", async () => {
    const f = await parcel(1, "TR"),
      s = await db.shipment.findUniqueOrThrow({
        where: { id: f.id },
        include: shipmentInclude,
      });
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        changeShipment(f.actor.id, f.order.id, f.id, 0, "saveLeg", {
          ...legValues(),
          legId: s.legs[0].id,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const denied = results.find((r) => r.status === "rejected");
    expect(denied?.status === "rejected" && denied.reason.message).toBe(
      "SHIPPING_STALE",
    );
    expect(
      await db.trackingEvent.count({ where: { legId: s.legs[0].id } }),
    ).toBe(1);
  });
  it("snapshots workflow edits and enforces an active default and optimistic revision", async () => {
    const f = await shippingFixture(db),
      actor = await shippingActor(db);
    const workflowId = await saveWorkflow(
      actor.id,
      workflowValues(f.market.id),
    );
    const id = await createShipment(
      actor.id,
      f.order.id,
      [{ orderItemId: f.order.items[0].id, quantity: 1 }],
      workflowId,
    );
    await saveWorkflow(actor.id, {
      ...workflowValues(f.market.id),
      id: workflowId,
      version: 0,
      nameI18n: { ...labels, en: "Changed" },
      legs: [{ type: "INTERNATIONAL", labelI18n: labels }],
    });
    const s = await db.shipment.findUniqueOrThrow({
      where: { id },
      include: shipmentInclude,
    });
    expect(s.nameI18n).toEqual(labels);
    expect(s.legs[0].type).toBe("DOMESTIC");
    await expect(
      saveWorkflow(actor.id, {
        ...workflowValues(f.market.id),
        id: workflowId,
        version: 0,
      }),
    ).rejects.toThrow("SHIPPING_STALE");
    await expect(
      saveWorkflow(actor.id, {
        ...workflowValues(f.market.id),
        isDefault: true,
        isActive: false,
      }),
    ).rejects.toThrow("SHIPPING_DEFAULT");
  });
  it("supports ad hoc legs and append-only public events while retaining cancelled legs", async () => {
    const f = await parcel(1, "TR");
    let s = await db.shipment.findUniqueOrThrow({
      where: { id: f.id },
      include: shipmentInclude,
    });
    await expect(
      changeShipment(f.actor.id, f.order.id, f.id, 0, "cancelLeg", {
        legId: s.legs[0].id,
      }),
    ).rejects.toThrow("SHIPPING_LAST_LEG");
    await changeShipment(f.actor.id, f.order.id, f.id, 0, "addLeg", {
      type: "DOMESTIC",
      labelI18n: labels,
    });
    s = await db.shipment.findUniqueOrThrow({
      where: { id: f.id },
      include: shipmentInclude,
    });
    await changeShipment(f.actor.id, f.order.id, f.id, s.version, "cancelLeg", {
      legId: s.legs[1].id,
    });
    s = await db.shipment.findUniqueOrThrow({
      where: { id: f.id },
      include: shipmentInclude,
    });
    await changeShipment(f.actor.id, f.order.id, f.id, s.version, "event", {
      legId: s.legs[0].id,
      description: "Parcel prepared",
      at: new Date(),
    });
    const event = await db.trackingEvent.findFirstOrThrow({
      where: { legId: s.legs[0].id },
    });
    await expect(
      db.trackingEvent.update({
        where: { id: event.id },
        data: { description: "changed" },
      }),
    ).rejects.toThrow();
    await expect(
      db.trackingEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
    expect(await db.shipmentLeg.count({ where: { shipmentId: f.id } })).toBe(2);
    expect(await db.auditLog.count({ where: { entityId: f.id } })).toBe(4);
  });
  it("returns identical misses and only the public projection; throttles pair and client independently", async () => {
    const f = await parcel();
    await change(f, 0, "IN_TRANSIT");
    const raw = { number: f.order.number, email: f.email };
    const view = await findPublicTracking(raw, randomUUID());
    expect(view?.shipments[0].legs[0].trackingUrl).toBe(
      "https://example.com/track/SHIP%20%2F%20123",
    );
    const text = JSON.stringify(view);
    for (const forbidden of [
      f.email,
      "costAmount",
      "costCurrency",
      "Private test address",
      "Private operations note",
      "customerId",
      "guestTokenHash",
      "totalAmount",
    ])
      expect(text).not.toContain(forbidden);
    expect(
      await findPublicTracking(
        { ...raw, email: "wrong@example.com" },
        randomUUID(),
      ),
    ).toBeNull();
    expect(
      await findPublicTracking({ ...raw, number: "missing" }, randomUUID()),
    ).toBeNull();
    for (let i = 1; i < 10; i++)
      expect(await findPublicTracking(raw, randomUUID())).not.toBeNull();
    expect(await findPublicTracking(raw, randomUUID())).toBeNull();
    const ip = randomUUID(),
      other = await shippingFixture(db);
    for (let i = 0; i < 30; i++) await findPublicTracking({}, ip);
    expect(
      await findPublicTracking(
        { number: other.order.number, email: other.email },
        ip,
      ),
    ).toBeNull();
  });
});
const subjects = [
  "owner",
  "admin",
  "warehouse",
  "accountant",
  "support",
  "data_entry",
  "marketing",
  "override",
  "anonymous",
];
describe.skipIf(!hasDb)(
  "shipping Subject × Action × Market boundary matrix",
  () => {
    for (const role of subjects)
      for (const permission of [
        "order.shipment.manage",
        "shipping.workflow.manage",
      ] as const)
        for (const inside of [true, false]) {
          it(`${role} ${permission} ${inside ? "in" : "out"}-scope: visibility plus forged action`, async () => {
            const tr = await db.market.findUniqueOrThrow({
              where: { code: "TR" },
            });
            const f = await shippingFixture(db, inside ? "TR" : "IR", 1);
            const actor =
              role === "anonymous"
                ? null
                : await shippingActor(
                    db,
                    role === "override" ? "support" : role,
                    tr.id,
                  );
            if (role === "override" && actor)
              await db.userPermissionOverride.create({
                data: {
                  userId: actor.id,
                  permission,
                  allow: true,
                  scope: { marketId: tr.id },
                },
              });
            session.userId = actor?.id ?? null;
            const allowed =
              inside &&
              (role === "owner" ||
                role === "admin" ||
                role === "override" ||
                (role === "warehouse" &&
                  permission === "order.shipment.manage"));
            expect(
              await can(actor?.id ?? "absent", permission, {
                marketId: f.market.id,
              }),
            ).toBe(allowed);
            const markets = await shippingMarkets(
              actor?.id ?? "absent",
              permission,
            );
            expect(markets.some((m) => m.id === f.market.id)).toBe(allowed);
            if (permission === "order.shipment.manage") {
              if (!allowed)
                await expect(
                  shippingOrder(actor?.id ?? "absent", f.order.id),
                ).rejects.toThrow("FORBIDDEN");
              const result = shipmentAction(
                shippingForm({
                  orderId: f.order.id,
                  operation: "create",
                  [`qty:${f.order.items[0].id}`]: "1",
                }),
              );
              if (allowed)
                await expect(result).resolves.toMatchObject({ ok: true });
              else
                await expect(result).rejects.toThrow(
                  actor ? "FORBIDDEN" : "UNAUTHENTICATED",
                );
              expect(
                await db.shipment.count({ where: { orderId: f.order.id } }),
              ).toBe(allowed ? 1 : 0);
            } else {
              const before = await db.shippingWorkflow.count({
                where: { marketId: f.market.id },
              });
              const result = workflowAction(
                shippingForm({
                  marketId: f.market.id,
                  isActive: "on",
                  nameFa: labels.fa,
                  nameTr: labels.tr,
                  nameEn: labels.en,
                  legs: JSON.stringify(workflowValues(f.market.id).legs),
                }),
              );
              if (allowed)
                await expect(result).resolves.toMatchObject({ ok: true });
              else
                await expect(result).rejects.toThrow(
                  actor ? "FORBIDDEN" : "UNAUTHENTICATED",
                );
              expect(
                await db.shippingWorkflow.count({
                  where: { marketId: f.market.id },
                }),
              ).toBe(before + (allowed ? 1 : 0));
            }
          });
        }
  },
);
