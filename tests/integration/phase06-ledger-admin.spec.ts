import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const acting = vi.hoisted(() => ({
  id: null as string | null,
  maintenance: false,
}));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.id ? { user: { id: acting.id } } : null),
}));
vi.mock("@/modules/settings", () => ({
  isMaintenanceOn: async () => acting.maintenance,
}));
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { postManualJournal } from "@/modules/finance/ledger";
import {
  journalList,
  journalDetail,
  journalFormOptions,
} from "@/modules/finance/ledger-admin";
import {
  postJournal,
  reviewJournal,
  reverseJournal,
} from "@/app/admin/(dashboard)/finance/journal/actions";
import { seedLedgerAccounts } from "../../prisma/ledger-seed";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  matrixSubjects,
  granted,
  fingerprint,
  type MatrixSubject,
} from "../helpers/permission-subjects";

let subjects: MatrixSubject[] = [],
  owner = "",
  tr = "",
  ir = "";
let accounts: {
  id: string;
  marketId: string;
  code: string;
  currency: string;
}[] = [];
const day = "2004-04-15",
  at = `${day}T00:00:00Z`;
const period = { from: day, to: day };
function request(marketId = tr) {
  const account = (code: string) =>
    accounts.find(
      (a) => a.marketId === marketId && a.currency === "TRY" && a.code === code,
    )!.id;
  return {
    marketId,
    requestKey: randomUUID(),
    memo: "Admin journal test",
    effectiveAt: at,
    fxAsOf: at,
    lines: [
      {
        accountId: account("cash"),
        currency: "TRY",
        debit: "100.0001",
        credit: "0",
        rateTry: "1",
        rateUsd: "0.025",
      },
      {
        accountId: account("partner_capital"),
        currency: "TRY",
        debit: "0",
        credit: "100.0001",
        rateTry: "1",
        rateUsd: "0.025",
      },
    ],
  };
}
const reverse = (entryId: string) => ({
  entryId,
  requestKey: randomUUID(),
  memo: "Admin reversal test",
  effectiveAt: at,
});
const tables = ["JournalEntry", "JournalLine", "AuditLog"];
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "ledger admin finance.journal.post / finance.report.view surfaces",
  () => {
    beforeAll(async () => {
      subjects = await matrixSubjects();
      owner = subjects.find((s) => s.name === "owner" && s.scope === "in")!.id!;
      tr = (await db.market.findUniqueOrThrow({ where: { code: "TR" } })).id;
      ir = (await db.market.findUniqueOrThrow({ where: { code: "IR" } })).id;
      await seedLedgerAccounts(db);
      accounts = await db.ledgerAccount.findMany();
    });
    afterAll(async () => {
      acting.id = null;
      acting.maintenance = false;
      await db.$disconnect();
    });

    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES)
        for (const target of ["TR", "IR"]) {
          it(`${name}/${scope}/${target}: list, detail, form, review, post and reverse use real market authorization`, async () => {
            const user = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!;
            const marketId = target === "TR" ? tr : ir;
            const scoped =
              scope === "in" || (scope === "market-out" && target === "TR");
            const write = granted(name, "finance.journal.post") && scoped;
            const read = granted(name, "finance.report.view") && scoped;
            acting.id = owner;
            const original = await postManualJournal(request(marketId));
            acting.id = user.id;
            if (read) {
              const list = await journalList({ ...period, marketId });
              expect(list.rows.every((e) => e.marketId === marketId)).toBe(
                true,
              );
              const detail = await journalDetail(original.id);
              expect(detail.entry.id).toBe(original.id);
              expect(detail.accounts).toHaveLength(2);
              expect(detail.canReverse).toBe(write);
            } else {
              await expect(
                journalList({ ...period, marketId }),
              ).rejects.toThrow();
              await expect(journalDetail(original.id)).rejects.toThrow();
            }
            if (
              granted(name, "finance.journal.post") &&
              ["in", "market-out"].includes(scope)
            ) {
              const options = await journalFormOptions();
              expect(options.markets.some((m) => m.id === marketId)).toBe(
                write,
              );
              expect(
                options.accounts.every((a) =>
                  options.markets.some((m) => m.id === a.marketId),
                ),
              ).toBe(true);
            } else await expect(journalFormOptions()).rejects.toThrow();
            const input = request(marketId),
              undo = reverse(original.id);
            const before = await fingerprint(tables);
            const review = await reviewJournal(input);
            expect(await fingerprint(tables)).toEqual(before);
            const posted = await postJournal({ request: input, confirm: true });
            const reversed = await reverseJournal({
              request: undo,
              confirm: true,
            });
            expect(review.ok).toBe(write);
            expect(posted.ok).toBe(write);
            expect(reversed.ok).toBe(write);
            if (!write) expect(await fingerprint(tables)).toEqual(before);
            else {
              if (!posted.ok || !reversed.ok || !review.ok)
                throw new Error("Expected posting success");
              expect(review.value[0].debitUsd).toBe("2.5000");
              expect(
                (
                  await db.journalEntry.findUniqueOrThrow({
                    where: { id: posted.value },
                  })
                ).createdById,
              ).toBe(user.id);
              expect(
                await postJournal({ request: input, confirm: true }),
              ).toEqual(posted);
              expect(
                await reverseJournal({ request: undo, confirm: true }),
              ).toEqual(reversed);
            }
          });
        }
    it("confirmation, forged payload, imbalance and maintenance fail without writes", async () => {
      acting.id = owner;
      const input = request(),
        original = await postManualJournal(request());
      const before = await fingerprint(tables);
      expect(
        await postJournal({ request: input, confirm: false }),
      ).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(
        await reverseJournal({ request: reverse(original.id) }),
      ).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(
        await postJournal({
          request: { ...input, userId: owner },
          confirm: true,
        }),
      ).toMatchObject({ ok: false, code: "VALIDATION" });
      expect(
        await postJournal({ request: input, confirm: true, actorId: owner }),
      ).toMatchObject({ ok: false, code: "VALIDATION" });
      const unbalanced = request();
      unbalanced.lines[1].credit = "99";
      expect(await reviewJournal(unbalanced)).toMatchObject({
        ok: false,
        code: "UNBALANCED_JOURNAL",
      });
      expect(
        await postJournal({ request: unbalanced, confirm: true }),
      ).toMatchObject({ ok: false, code: "UNBALANCED_JOURNAL" });
      acting.maintenance = true;
      try {
        expect(
          await postJournal({ request: input, confirm: true }),
        ).toMatchObject({ ok: false, code: "MAINTENANCE" });
        expect(
          await reverseJournal({
            request: reverse(original.id),
            confirm: true,
          }),
        ).toMatchObject({ ok: false, code: "MAINTENANCE" });
      } finally {
        acting.maintenance = false;
      }
      expect(await fingerprint(tables)).toEqual(before);
    });
    it("review does not retain permission or active-account authority, and cache failure cannot conceal a committed entry", async () => {
      acting.id = owner;
      const input = request();
      expect((await reviewJournal(input)).ok).toBe(true);
      const target = input.lines[0].accountId;
      await db.ledgerAccount.update({
        where: { id: target },
        data: { isActive: false },
      });
      try {
        expect(
          (await journalFormOptions()).accounts.some((a) => a.id === target),
        ).toBe(false);
        expect(
          await postJournal({ request: input, confirm: true }),
        ).toMatchObject({ ok: false, code: "INVALID_LEDGER_ACCOUNT" });
      } finally {
        await db.ledgerAccount.update({
          where: { id: target },
          data: { isActive: true },
        });
      }
      acting.id = subjects.find(
        (s) => s.name === "support" && s.scope === "in",
      )!.id;
      expect(
        await postJournal({ request: input, confirm: true }),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
      acting.id = owner;
      vi.mocked(revalidatePath).mockImplementationOnce(() => {
        throw new Error("Cache refresh interrupted");
      });
      const result = await postJournal({ request: input, confirm: true });
      expect(result.ok).toBe(true);
      expect(await postJournal({ request: input, confirm: true })).toEqual(
        result,
      );
      expect(
        await postJournal({
          request: { ...input, memo: "Changed" },
          confirm: true,
        }),
      ).toMatchObject({ ok: false, code: "JOURNAL_REQUEST_CONFLICT" });
    });
    it("pages all entries exactly once, includes inactive markets and validates cursor scope/date boundaries", async () => {
      acting.id = owner;
      const unique = { from: "2004-05-01", to: "2004-05-01", marketId: ir };
      const ids = [];
      for (let i = 0; i < 32; i++)
        ids.push(
          (
            await postManualJournal({
              ...request(ir),
              effectiveAt: "2004-05-01T23:59:59.999Z",
            })
          ).id,
        );
      await postManualJournal({
        ...request(ir),
        effectiveAt: "2004-05-02T00:00:00Z",
      });
      const first = await journalList(unique);
      expect(first.rows).toHaveLength(30);
      expect(first.next).toBeTruthy();
      const second = await journalList({ ...unique, cursor: first.next });
      expect(second.rows).toHaveLength(2);
      expect(second.next).toBeNull();
      expect(new Set([...first.rows, ...second.rows].map((e) => e.id))).toEqual(
        new Set(ids),
      );
      await expect(
        journalList({ ...unique, marketId: tr, cursor: first.next }),
      ).rejects.toThrow("INVALID_JOURNAL_CURSOR");
      await expect(
        journalList({ ...unique, from: [unique.from] }),
      ).rejects.toThrow();
      await expect(
        journalList({ ...unique, to: "2003-01-01" }),
      ).rejects.toThrow();
      const market = await db.market.findUniqueOrThrow({ where: { id: ir } });
      await db.market.update({ where: { id: ir }, data: { isActive: false } });
      try {
        expect((await journalList(unique)).rows).toHaveLength(30);
      } finally {
        await db.market.update({
          where: { id: ir },
          data: { isActive: market.isActive },
        });
      }
    }, 30000);
  },
);
