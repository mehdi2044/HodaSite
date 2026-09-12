import React from "react";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const acting = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.userId ? { user: { id: acting.userId } } : null),
}));
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((key: string) => key, { has: () => true }),
}));
import { db } from "@/lib/db";
import {
  SUBJECTS,
  granted,
  matrixSubjects,
  form,
  fingerprint,
  errorCode,
  type MatrixSubject,
} from "../helpers/permission-subjects";
import { returnFixture } from "../helpers/returns";
import {
  shippingFixture,
  shippingActor,
  workflowValues,
} from "../helpers/shipping";
import { adminOrder } from "@/modules/orders/service";
import OrderPage from "@/app/admin/(dashboard)/orders/[number]/page";
import {
  orderAction,
  bankAccountAction,
} from "@/app/admin/(dashboard)/orders/actions";
import {
  shipmentAction,
  workflowAction,
} from "@/app/admin/(dashboard)/settings/shipping/actions";
import { manageReturnAction } from "@/app/admin/(dashboard)/returns/actions";
import { requestReturn, manageReturn } from "@/modules/returns/service";
import { GET as downloadInvoice } from "@/app/api/orders/[number]/invoices/[id]/route";
import { storage } from "@/modules/integrations/storage";
const permissions = [
  "markets.edit",
  "order.cancel",
  "order.edit",
  "order.view",
  "order.invoice.view",
  "order.shipment.manage",
  "payment.mark_paid",
  "payment.receipt.approve",
  "payment.refund",
  "return.manage",
  "shipping.workflow.manage",
];
const tables = [
  "Order",
  "OrderEvent",
  "Payment",
  "Refund",
  "ReturnRequest",
  "ReturnItem",
  "StoreCredit",
  "CreditUse",
  "StockItem",
  "StockMovement",
  "Lot",
  "Reservation",
  "Shipment",
  "ShipmentItem",
  "ShipmentLeg",
  "ShippingWorkflow",
  "ShippingLegTemplate",
  "MarketBankAccount",
  "Invoice",
  "Job",
  "AuditLog",
];
let subjects: MatrixSubject[] = [],
  setupOwner = "";
const invoiceBytes = Buffer.from("%PDF-1.4\nPrivate permission fixture\n%%EOF");
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "V-4 market operations × real subjects × TR/IR × UI/direct forged payload",
  () => {
    beforeAll(async () => {
      vi.stubGlobal("React", React);
      subjects = await matrixSubjects(false);
      setupOwner = (await shippingActor(db)).id;
    }, 60000);
    afterAll(() => {
      acting.userId = null;
    });
    for (const permission of permissions)
      for (const name of SUBJECTS)
        for (const code of ["TR", "IR"])
          for (const direct of [false, true]) {
            it(`${permission} / ${name} / ${code === "TR" ? "in" : "out"} / ${direct ? "direct forged" : "UI request"}`, async () => {
              acting.userId = subjects.find((s) => s.name === name)!.id;
              const allowed =
                code === "TR" &&
                granted(name, permission) &&
                (permission !== "payment.refund" ||
                  granted(name, "return.manage"));
              const market = await db.market.findUniqueOrThrow({
                where: { code },
              });
              let run: () => Promise<unknown>,
                verify: () => Promise<void> = async () => {};
              if (permission === "markets.edit") {
                run = () =>
                  bankAccountAction(
                    form(
                      {
                        marketId: market.id,
                        label: "Matrix bank",
                        bankName: "Matrix",
                        holder: "Test shop",
                        accountNumber: randomUUID(),
                        isActive: "on",
                        sortOrder: "0",
                      },
                      direct,
                    ),
                  );
              } else if (permission === "shipping.workflow.manage") {
                const values = workflowValues(market.id);
                run = () =>
                  workflowAction(
                    form(
                      {
                        marketId: market.id,
                        version: "0",
                        nameFa: "مسیر آزمایشی",
                        nameTr: "Test",
                        nameEn: "Test",
                        isActive: "on",
                        legs: JSON.stringify(values.legs),
                      },
                      direct,
                    ),
                  );
              } else if (permission === "order.shipment.manage") {
                const f = await shippingFixture(db, code);
                run = () =>
                  shipmentAction(
                    form(
                      {
                        orderId: f.order.id,
                        operation: "create",
                        [`qty:${f.order.items[0].id}`]: "1",
                        marketId: subjects[0].id ?? "forged",
                      },
                      direct,
                    ),
                  );
                verify = async () => {
                  expect(
                    await db.shipment.count({ where: { orderId: f.order.id } }),
                  ).toBe(1);
                };
              } else if (permission === "order.view") {
                const f = await shippingFixture(db, code);
                run = () =>
                  direct
                    ? adminOrder(f.order.number, acting.userId ?? "")
                    : OrderPage({
                        params: Promise.resolve({ number: f.order.number }),
                      });
              } else if (permission === "order.invoice.view") {
                const f = await shippingFixture(db, code);
                const key = `invoices/matrix-${randomUUID()}.pdf`;
                await storage.put(key, invoiceBytes, "application/pdf");
                const media = await db.media.create({
                  data: {
                    kind: "invoice",
                    storageKey: key,
                    originalName: "matrix.pdf",
                    url: "",
                    bytes: invoiceBytes.length,
                    mime: "application/pdf",
                    status: "READY",
                  },
                });
                const invoice = await db.invoice.create({
                  data: {
                    orderId: f.order.id,
                    version: 1,
                    snapshot: {},
                    status: "READY",
                    mediaId: media.id,
                  },
                });
                run = async () => {
                  const response = await downloadInvoice(
                    new Request(
                      `http://localhost/api/orders/${f.order.number}/invoices/${invoice.id}${direct ? "?userId=seed-owner&permission=*" : ""}`,
                    ),
                    {
                      params: Promise.resolve({
                        number: f.order.number,
                        id: invoice.id,
                      }),
                    },
                  );
                  expect(response.headers.get("cache-control")).toBe(
                    "private, no-store",
                  );
                  if (allowed) {
                    expect(response.status).toBe(200);
                    expect(Buffer.from(await response.arrayBuffer())).toEqual(
                      invoiceBytes,
                    );
                    return { ok: true };
                  }
                  expect(response.status).toBe(404);
                  expect(await response.text()).toBe("");
                  return { error: "PRIVATE_NOT_FOUND" };
                };
              } else if (
                permission === "return.manage" ||
                permission === "payment.refund"
              ) {
                const f = await returnFixture(db, { code });
                const r = await requestReturn(f.customer.id, {
                  orderId: f.order.id,
                  requestKey: randomUUID(),
                  type: "RETURN",
                  reasonCode: "SIZE",
                  items: [{ orderItemId: f.order.items[0].id, quantity: 1 }],
                });
                if (permission === "payment.refund") {
                  await manageReturn(setupOwner, {
                    returnId: r.id,
                    version: 0,
                    operation: "APPROVE",
                  });
                  const item = await db.returnItem.findFirstOrThrow({
                    where: { returnRequestId: r.id },
                  });
                  await manageReturn(setupOwner, {
                    returnId: r.id,
                    version: 1,
                    operation: "RECEIVE",
                    conditions: [{ itemId: item.id, condition: "RESTOCK" }],
                  });
                }
                run = () =>
                  manageReturnAction(
                    form(
                      {
                        returnId: r.id,
                        version: permission === "payment.refund" ? "2" : "0",
                        operation:
                          permission === "payment.refund"
                            ? "REFUND"
                            : "APPROVE",
                        note: "Matrix refund verification",
                        marketId: "forged-market",
                      },
                      direct,
                    ),
                  );
                verify = async () => {
                  expect(
                    (
                      await db.returnRequest.findUniqueOrThrow({
                        where: { id: r.id },
                      })
                    ).status,
                  ).toBe(
                    permission === "payment.refund" ? "RESOLVED" : "APPROVED",
                  );
                };
              } else {
                const f = await returnFixture(db, { code, pending: true });
                const operation =
                  permission === "order.cancel"
                    ? "cancel"
                    : permission === "order.edit"
                      ? "note"
                      : permission === "payment.mark_paid"
                        ? "cash"
                        : "approve";
                if (operation === "approve")
                  await db.payment.create({
                    data: {
                      orderId: f.order.id,
                      status: "SUBMITTED",
                      amount: f.order.totalAmount,
                      currency: f.order.currency,
                    },
                  });
                run = () =>
                  orderAction(
                    form(
                      {
                        orderId: f.order.id,
                        operation,
                        reason: "Matrix note",
                        marketId: "forged-market",
                      },
                      direct,
                    ),
                  );
                verify = async () => {
                  const row = await db.order.findUniqueOrThrow({
                    where: { id: f.order.id },
                  });
                  if (operation === "note")
                    expect(row.adminNote).toBe("Matrix note");
                  else
                    expect(row.status).toBe(
                      operation === "cancel" ? "CANCELLED" : "PAID",
                    );
                };
              }
              const before = await fingerprint(tables);
              let result: unknown;
              try {
                result = await run();
              } catch (e) {
                result = { error: errorCode(e) };
              }
              if (allowed) {
                expect(result).toBeTruthy();
                expect(result).not.toHaveProperty("error");
                expect(result).not.toMatchObject({ ok: false });
                await verify();
                if (!["order.view", "order.invoice.view"].includes(permission))
                  expect(await fingerprint(tables)).not.toEqual(before);
              } else {
                const error = (result as { error?: string }).error;
                if (permission === "order.invoice.view")
                  expect(error).toBe("PRIVATE_NOT_FOUND");
                else if (permission === "order.view" && !direct)
                  expect(error).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/);
                else
                  expect(error).toBe(
                    name === "anonymous"
                      ? permission === "order.view"
                        ? "FORBIDDEN"
                        : [
                              "order.cancel",
                              "order.edit",
                              "payment.mark_paid",
                              "payment.receipt.approve",
                              "markets.edit",
                            ].includes(permission)
                          ? "LOGIN_REQUIRED"
                          : "UNAUTHORIZED"
                      : "FORBIDDEN",
                  );
                expect(await fingerprint(tables)).toEqual(before);
              }
            }, 30000);
          }
  },
);
