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
import {
  reconciliationList,
  reconciliationDetail,
} from "@/modules/finance/reconciliation-service";
import ReconciliationPage from "@/app/admin/(dashboard)/finance/reconciliation/page";
import ReconciliationDetail from "@/app/admin/(dashboard)/finance/reconciliation/[id]/page";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  granted,
  matrixSubjects,
  fingerprint,
  type MatrixSubject,
} from "../helpers/permission-subjects";
import { reconciliationFixture } from "../helpers/reconciliation";
import { returnFixture } from "../helpers/returns";

const period = { from: "2006-01-15", to: "2006-01-15" };
let subjects: MatrixSubject[] = [];
let tr: Awaited<ReturnType<typeof reconciliationFixture>>, ir: typeof tr;
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "finance.report.view order reconciliation",
  () => {
    beforeAll(async () => {
      vi.stubGlobal("React", React);
      subjects = await matrixSubjects();
      tr = await reconciliationFixture(db);
      ir = await reconciliationFixture(db, { code: "IR" });
    }, 60000);
    afterAll(() => {
      acting.id = null;
    });
    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES)
        for (const target of ["TR", "IR", "all"] as const) {
          it(`finance.report.view / ${name} / ${scope} / ${target}: list and direct detail services/pages`, async () => {
            acting.id = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const allowed =
              granted(name, "finance.report.view") &&
              (scope === "in" || (scope === "market-out" && target !== "IR"));
            const f = target === "IR" ? ir : tr;
            const filter = {
              ...period,
              ...(target === "all" ? {} : { marketId: f.market.id }),
            };
            if (allowed) {
              const list = await reconciliationList(filter);
              expect(list.rows.some((r) => r.id === f.order.id)).toBe(true);
              if (scope === "market-out")
                expect(list.markets.map((m) => m.id)).toEqual([tr.market.id]);
              const detail = await reconciliationDetail(f.order.id);
              expect(detail.review).toMatchObject({
                issues: [],
                totals: {
                  approved: "100.0001",
                  external: "60.0001",
                  credit: "40.0000",
                  difference: "0.0000",
                },
              });
              for (const privateData of [
                f.customer.email!,
                "private-bank-reference",
                "private-quote-terms",
                "contactSnapshot",
                "shippingAddress",
                "bankSnapshot",
                "customerId",
                "guestTokenHash",
                "reference",
              ])
                expect(JSON.stringify({ list, detail })).not.toContain(
                  privateData,
                );
              expect(
                React.isValidElement(
                  await ReconciliationPage({
                    searchParams: Promise.resolve({
                      ...filter,
                      userId: "forged-owner",
                    }),
                  }),
                ),
              ).toBe(true);
              expect(
                React.isValidElement(
                  await ReconciliationDetail({
                    params: Promise.resolve({ id: f.order.id }),
                  }),
                ),
              ).toBe(true);
            } else {
              await expect(reconciliationList(filter)).rejects.toThrow(
                /FORBIDDEN|UNAUTHENTICATED/,
              );
              await expect(reconciliationDetail(f.order.id)).rejects.toThrow(
                /FORBIDDEN|UNAUTHENTICATED/,
              );
              await expect(
                ReconciliationPage({
                  searchParams: Promise.resolve({
                    ...filter,
                    userId: "forged-owner",
                  }),
                }),
              ).rejects.toThrow(/NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK;404/);
              await expect(
                ReconciliationDetail({
                  params: Promise.resolve({ id: f.order.id }),
                }),
              ).rejects.toThrow(/NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK;404/);
            }
          });
        }
    const accountant = () =>
      subjects.find((s) => s.name === "accountant" && s.scope === "market-out")!
        .id!;
    it("reads without changing financial records or audit history; spent credit remains evidence", async () => {
      acting.id = accountant();
      const tables = [
        "Order",
        "OrderItem",
        "OrderFee",
        "Payment",
        "Refund",
        "CreditUse",
        "StoreCredit",
        "JournalEntry",
        "JournalLine",
        "AuditLog",
      ];
      const before = await fingerprint(tables);
      await reconciliationList(period);
      await reconciliationDetail(tr.order.id);
      expect(await fingerprint(tables)).toEqual(before);
    });
    it("denies unknown/out-of-scope details and cursor probes and rejects malformed input", async () => {
      acting.id = accountant();
      for (const id of [randomUUID(), ir.order.id]) {
        await expect(reconciliationDetail(id)).rejects.toThrow("FORBIDDEN");
        await expect(
          reconciliationList({ ...period, cursor: id }),
        ).rejects.toThrow("INVALID_RECONCILIATION_CURSOR");
      }
      for (const query of [
        { from: [period.from] },
        { from: "2006-02-30" },
        { from: "2006-02-01", to: period.to },
        { userId: "forged-owner" },
        { cursor: [tr.order.id] },
      ])
        await expect(
          reconciliationList({ ...period, ...query }),
        ).rejects.toThrow();
    });
    it("applies permission denial and account deactivation immediately", async () => {
      acting.id = accountant();
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: acting.id,
          permission: "finance.report.view",
          allow: false,
          scope: { marketId: tr.market.id },
        },
      });
      try {
        await expect(reconciliationDetail(tr.order.id)).rejects.toThrow(
          "FORBIDDEN",
        );
      } finally {
        await db.userPermissionOverride.delete({ where: { id: deny.id } });
      }
      await db.user.update({
        where: { id: acting.id },
        data: { isActive: false },
      });
      try {
        await expect(reconciliationList(period)).rejects.toThrow("FORBIDDEN");
      } finally {
        await db.user.update({
          where: { id: acting.id },
          data: { isActive: true },
        });
      }
    });
    it("shows historic missing dates in direct detail, excludes them from dated lists and flags returns", async () => {
      acting.id = accountant();
      const old = await returnFixture(db, { pending: true });
      const data = await reconciliationDetail(old.order.id);
      expect(data.review.issues).toContain("NOT_PAID");
      expect(data.review.issues).toContain("FX_MISSING");
      await expect(
        reconciliationList({ ...period, cursor: old.order.id }),
      ).rejects.toThrow("INVALID_RECONCILIATION_CURSOR");
      const returned = await reconciliationFixture(db, { day: "2006-03-01" });
      await db.returnRequest.create({
        data: {
          orderId: returned.order.id,
          customerId: returned.customer.id,
          reasonCode: "SIZE",
          type: "RETURN",
          status: "REQUESTED",
        },
      });
      expect(
        (await reconciliationDetail(returned.order.id)).review.issues,
      ).toEqual(["RETURN_ACTIVITY"]);
    });
    it("paginates tied timestamps without losing rows and excludes the following UTC midnight", async () => {
      acting.id = accountant();
      const ids: string[] = [];
      for (let i = 0; i < 31; i++) {
        const f = await returnFixture(db, { pending: true });
        ids.push(f.order.id);
        await db.order.update({
          where: { id: f.order.id },
          data: { status: "PAID", paidAt: new Date("2006-02-01T00:00:00Z") },
        });
      }
      const outside = await returnFixture(db, { pending: true });
      await db.order.update({
        where: { id: outside.order.id },
        data: { status: "PAID", paidAt: new Date("2006-02-02T00:00:00Z") },
      });
      const filter = { from: "2006-02-01", to: "2006-02-01" };
      const first = await reconciliationList(filter);
      expect(first.rows).toHaveLength(30);
      expect(first.next).toBe(first.rows[29].id);
      const second = await reconciliationList({
        ...filter,
        cursor: first.next,
      });
      expect(second.rows).toHaveLength(1);
      expect(second.next).toBeNull();
      expect([...first.rows, ...second.rows].map((r) => r.id).sort()).toEqual(
        ids.sort(),
      );
      await expect(
        reconciliationList({ ...filter, cursor: outside.order.id }),
      ).rejects.toThrow("INVALID_RECONCILIATION_CURSOR");
    }, 60000);
  },
);
