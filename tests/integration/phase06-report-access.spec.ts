import React from "react";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const acting = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.id ? { user: { id: acting.id } } : null),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "fa",
  getTranslations: async () =>
    Object.assign((key: string) => key, { has: () => true }),
}));
import { db } from "@/lib/db";
import { financeReport } from "@/modules/finance";
import { GET } from "@/app/admin/(dashboard)/finance/export/route";
import FinancePage from "@/app/admin/(dashboard)/finance/page";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  granted,
  matrixSubjects,
  type MatrixSubject,
} from "../helpers/permission-subjects";
import { returnFixture } from "../helpers/returns";
const period = { from: "2001-01-01", to: "2001-01-02" };
let subjects: MatrixSubject[] = [],
  tr = "",
  ir = "";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "finance.report.view operational matrix and exact PostgreSQL aggregates",
  () => {
    beforeAll(async () => {
      vi.stubGlobal("React", React);
      subjects = await matrixSubjects();
      tr = (await db.market.findUniqueOrThrow({ where: { code: "TR" } })).id;
      ir = (await db.market.findUniqueOrThrow({ where: { code: "IR" } })).id;
      for (const code of ["TR", "IR"]) {
        const f = await returnFixture(db, {
          code,
          pending: true,
          quantity: 2,
          price: "50",
        });
        await db.order.update({
          where: { id: f.order.id },
          data: { status: "PAID", paidAt: new Date("2001-01-01T00:00:00Z") },
        });
        const cash = await db.payment.create({
          data: {
            orderId: f.order.id,
            amount: "60.0001",
            currency: f.market.currency,
            method: "CASH",
            status: "APPROVED",
            reviewedAt: new Date("2001-01-01T00:00:00Z"),
          },
        });
        const credit = await db.payment.create({
          data: {
            orderId: f.order.id,
            amount: "39.9999",
            currency: f.market.currency,
            method: "STORE_CREDIT",
            status: "APPROVED",
            reviewedAt: new Date("2001-01-02T23:59:59.999Z"),
          },
        });
        const refundReturn = await db.returnRequest.create({
          data: {
            orderId: f.order.id,
            customerId: f.customer.id,
            type: "RETURN",
            reasonCode: "SIZE",
            status: "RESOLVED",
            resolution: "REFUND",
            refundAmount: "14.0002",
          },
        });
        // Refund-to-credit, direct return credit and exchange credit each issue once.
        for (const [type, resolution, amount] of [
          ["RETURN", "REFUND", "4"],
          ["RETURN", "STORE_CREDIT", "5.5"],
          ["EXCHANGE", "EXCHANGE", "2.5"],
        ] as const) {
          const source =
            resolution === "REFUND"
              ? refundReturn
              : await db.returnRequest.create({
                  data: {
                    orderId: f.order.id,
                    customerId: f.customer.id,
                    type,
                    reasonCode: "SIZE",
                    status: "RESOLVED",
                    resolution,
                    refundAmount: amount,
                  },
                });
          await db.storeCredit.create({
            data: {
              customerId: f.customer.id,
              sourceReturnId: source.id,
              amount,
              balance: "0",
              currency: f.market.currency,
              createdAt: new Date("2001-01-02T12:00:00Z"),
            },
          });
        }
        // Unrelated credit is not labeled as a return; undated approvals are not dated by creation.
        await db.storeCredit.create({
          data: {
            customerId: f.customer.id,
            amount: "7",
            balance: "7",
            currency: f.market.currency,
            createdAt: new Date("2001-01-02T12:00:00Z"),
          },
        });
        await db.payment.create({
          data: {
            orderId: f.order.id,
            currency: f.market.currency,
            amount: "999",
            status: "APPROVED",
            reviewedAt: null,
            createdAt: new Date("2001-01-01T12:00:00Z"),
          },
        });
        for (const [payment, amount] of [
          [cash, "10.0002"],
          [credit, "4"],
        ] as const)
          await db.refund.create({
            data: {
              orderId: f.order.id,
              paymentId: payment.id,
              returnRequestId: refundReturn.id,
              currency: f.market.currency,
              amount,
              method: payment.method,
              reason: "Finance test",
              status: "COMPLETED",
              createdAt: new Date("2001-01-02T12:00:00Z"),
            },
          });
        // A refund is counted in its own period, even for an older sale.
        const old = await returnFixture(db, {
          code,
          pending: true,
          quantity: 2,
          price: "5",
        });
        const p = await db.payment.create({
          data: {
            orderId: old.order.id,
            currency: f.market.currency,
            amount: "10",
            status: "APPROVED",
            reviewedAt: new Date("2000-12-31T23:59:59.999Z"),
          },
        });
        await db.refund.create({
          data: {
            orderId: old.order.id,
            paymentId: p.id,
            currency: f.market.currency,
            amount: "2",
            method: "OFFLINE_BANK_TRANSFER",
            reason: "Older order refund",
            status: "COMPLETED",
            createdAt: new Date("2001-01-01T00:00:00Z"),
          },
        });
        await db.refund.create({
          data: {
            orderId: old.order.id,
            paymentId: p.id,
            currency: f.market.currency,
            amount: "1",
            method: "OFFLINE_BANK_TRANSFER",
            reason: "Excluded pending",
            status: "PENDING",
            createdAt: new Date("2001-01-01T00:00:00Z"),
          },
        });
        // Inclusive end date must not admit midnight of the following day.
        const outside = await returnFixture(db, {
          code,
          pending: true,
          quantity: 1,
          price: "9",
        });
        await db.payment.create({
          data: {
            orderId: outside.order.id,
            currency: f.market.currency,
            amount: "9",
            status: "APPROVED",
            reviewedAt: new Date("2001-01-03T00:00:00Z"),
          },
        });
      }
    }, 60000);
    afterAll(() => {
      acting.id = null;
    });
    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES)
        for (const target of ["TR", "IR", "all"] as const) {
          it(`finance.report.view / ${name} / ${scope} / ${target}: direct service, UI and CSV`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const allowed =
              granted(name, "finance.report.view") &&
              (scope === "in" || (scope === "market-out" && target !== "IR"));
            const filter = {
              ...period,
              ...(target === "all"
                ? {}
                : { marketId: target === "TR" ? tr : ir }),
            };
            const request = new Request(
              `http://localhost/admin/finance/export?${new URLSearchParams({ ...filter, userId: "forged-owner", permission: "*" })}`,
            );
            if (allowed) {
              const report = await financeReport(filter);
              expect(report.rows.some((r) => r.marketId === tr)).toBe(
                target !== "IR",
              );
              if (scope === "market-out")
                expect(report.markets.map((m) => m.id)).toEqual([tr]);
              const row = report.rows.find(
                (r) => r.marketId === (target === "IR" ? ir : tr),
              )!;
              expect(row.totals).toMatchObject({
                paidOrders: "100.0000",
                orderCount: "1",
                externalPayments: "60.0001",
                creditPayments: "39.9999",
                externalRefunds: "12.0002",
                creditRefunds: "12.0000",
                netExternal: "47.9999",
              });
              expect(
                React.isValidElement(
                  await FinancePage({
                    searchParams: Promise.resolve({
                      ...filter,
                      userId: "forged-owner",
                      permission: "*",
                    }),
                  }),
                ),
              ).toBe(true);
              expect(BigInt(row.totals.undated)).toBeGreaterThan(0n);
              const res = await GET(request);
              expect(res.status).toBe(200);
              expect(res.headers.get("cache-control")).toBe(
                "private, no-store",
              );
              const csv = await res.text();
              expect(csv).toContain('"47.9999"');
              expect(csv).not.toContain("@example.com");
              if (scope === "market-out") expect(csv).not.toContain('"IR"');
            } else {
              await expect(financeReport(filter)).rejects.toThrow(
                /FORBIDDEN|UNAUTHENTICATED/,
              );
              await expect(
                FinancePage({ searchParams: Promise.resolve(filter) }),
              ).rejects.toThrow(/NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK;404/);
              expect((await GET(request)).status).toBe(
                name === "anonymous" ? 401 : 403,
              );
            }
          });
        }
    it("unknown and forbidden markets share denial; duplicate/invalid dates return 400", async () => {
      acting.id = subjects.find(
        (s) => s.name === "accountant" && s.scope === "market-out",
      )!.id;
      for (const marketId of [ir, randomUUID()])
        expect(
          (
            await GET(
              new Request(
                `http://localhost/admin/finance/export?marketId=${marketId}`,
              ),
            )
          ).status,
        ).toBe(403);
      for (const q of [
        "from=2001-01-01&from=2001-01-02",
        "from=2001-02-30",
        "from=2001-03-01&to=2001-01-01",
      ])
        expect(
          (await GET(new Request(`http://localhost/admin/finance/export?${q}`)))
            .status,
        ).toBe(400);
    });
    it("matching deny and deactivation apply immediately", async () => {
      const user = subjects.find(
        (s) => s.name === "accountant" && s.scope === "in",
      )!;
      acting.id = user.id;
      const override = await db.userPermissionOverride.create({
        data: {
          userId: user.id!,
          permission: "finance.report.view",
          allow: false,
          scope: { marketId: tr },
        },
      });
      try {
        await expect(
          financeReport({ ...period, marketId: tr }),
        ).rejects.toThrow("FORBIDDEN");
      } finally {
        await db.userPermissionOverride.delete({ where: { id: override.id } });
      }
      await db.user.update({
        where: { id: user.id! },
        data: { isActive: false },
      });
      try {
        await expect(financeReport(period)).rejects.toThrow("FORBIDDEN");
      } finally {
        await db.user.update({
          where: { id: user.id! },
          data: { isActive: true },
        });
      }
    });
  },
);
