import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const acting = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.id ? { user: { id: acting.id } } : null),
}));
import { db } from "@/lib/db";
import {
  postManualJournal,
  reversePostedJournal,
  readJournalEntry,
} from "@/modules/finance";
import { normalizeJournal } from "@/modules/finance/journal-input";
import { LEDGER_CHART, seedLedgerAccounts } from "../../prisma/ledger-seed";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  matrixSubjects,
  granted,
  type MatrixSubject,
} from "../helpers/permission-subjects";

let subjects: MatrixSubject[] = [],
  owner = "",
  tr = "",
  ir = "";
type Account = { id: string; code: string; currency: string; marketId: string };
let accounts: Account[] = [];
const at = "2003-01-01T00:00:00Z";
function input(marketId = tr) {
  const account = (code: string) =>
    accounts.find(
      (a) => a.code === code && a.marketId === marketId && a.currency === "TRY",
    )!.id;
  return {
    marketId,
    requestKey: randomUUID(),
    memo: "Synthetic opening journal",
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
function reverse(entryId: string) {
  return {
    entryId,
    requestKey: randomUUID(),
    memo: "Correct synthetic entry",
    effectiveAt: "2003-01-02T00:00:00Z",
  };
}
async function direct(
  raw: ReturnType<typeof input>,
  change: (data: Prisma.JournalEntryUncheckedCreateInput) => void = () => {},
) {
  const n = normalizeJournal(raw);
  const data: Prisma.JournalEntryUncheckedCreateInput = {
    marketId: n.marketId,
    requestKey: n.requestKey,
    requestHash: "a".repeat(64),
    memo: n.memo,
    createdById: owner,
    effectiveAt: n.effectiveAt,
    fxAsOf: n.fxAsOf,
    lines: { create: n.lines },
  };
  change(data);
  return db.$transaction(async (tx) => {
    const e = await tx.journalEntry.create({ data });
    return tx.journalEntry.update({
      where: { id: e.id },
      data: { status: "POSTED" },
    });
  });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "persistent ledger and finance.journal.post operational matrix",
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
      await db.$disconnect();
    });

    it("seeds all four currencies per market and preserves configured names", async () => {
      const rows = await db.ledgerAccount.findMany({ where: { marketId: tr } });
      expect(rows).toHaveLength(4 * LEDGER_CHART.length);
      const a = rows[0];
      await db.ledgerAccount.update({
        where: { id: a.id },
        data: { nameI18n: { en: "Owner label" } },
      });
      try {
        await seedLedgerAccounts(db);
        expect(
          (await db.ledgerAccount.findUniqueOrThrow({ where: { id: a.id } }))
            .nameI18n,
        ).toEqual({ en: "Owner label" });
      } finally {
        await db.ledgerAccount.update({
          where: { id: a.id },
          data: { nameI18n: a.nameI18n as Prisma.InputJsonValue },
        });
      }
    });

    it("posts exact frozen amounts and one audit, with canonical retry", async () => {
      acting.id = owner;
      const r = input();
      const e = await postManualJournal(r);
      expect(e.status).toBe("POSTED");
      expect(e.lines[0].debit.toFixed(4)).toBe("100.0001");
      expect(e.lines[0].debitUsd.toFixed(4)).toBe("2.5000");
      expect(e.createdById).toBe(owner);
      r.lines[0].credit = "0.0000";
      expect((await postManualJournal(r)).id).toBe(e.id);
      expect(
        await db.auditLog.count({
          where: { entityType: "JournalEntry", entityId: e.id },
        }),
      ).toBe(1);
      await expect(
        postManualJournal({ ...r, memo: "Different payload" }),
      ).rejects.toThrow("JOURNAL_REQUEST_CONFLICT");
      expect((await readJournalEntry(e.id)).id).toBe(e.id);
    });

    it("serializes simultaneous retries; conflicting content cannot create a second entry", async () => {
      acting.id = owner;
      const r = input();
      const entries = await Promise.all(
        Array.from({ length: 4 }, () => postManualJournal(r)),
      );
      expect(new Set(entries.map((e) => e.id)).size).toBe(1);
      const conflict = input();
      const attempts = await Promise.allSettled([
        postManualJournal(conflict),
        postManualJournal({ ...conflict, memo: "Conflict" }),
      ]);
      expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.journalEntry.count({
          where: { marketId: tr, requestKey: conflict.requestKey },
        }),
      ).toBe(1);
    });

    it("reverses once, retains the original, and copies rates even after account deactivation", async () => {
      acting.id = owner;
      const e = await postManualJournal(input()),
        r = reverse(e.id);
      await db.ledgerAccount.update({
        where: { id: e.lines[0].accountId },
        data: { isActive: false },
      });
      try {
        const undo = await reversePostedJournal(r);
        expect(undo.reversalOfId).toBe(e.id);
        expect(undo.fxAsOf).toEqual(e.fxAsOf);
        expect(undo.lines[0].credit.toFixed(4)).toBe(
          e.lines[0].debit.toFixed(4),
        );
        expect(undo.lines[0].creditUsd.toFixed(4)).toBe(
          e.lines[0].debitUsd.toFixed(4),
        );
        expect((await reversePostedJournal(r)).id).toBe(undo.id);
        expect((await readJournalEntry(e.id)).reversal?.id).toBe(undo.id);
        await expect(reversePostedJournal(reverse(e.id))).rejects.toThrow(
          "JOURNAL_ALREADY_REVERSED",
        );
        await expect(reversePostedJournal(reverse(undo.id))).rejects.toThrow(
          "JOURNAL_ALREADY_REVERSED",
        );
        expect(
          await db.journalEntry.findUniqueOrThrow({
            where: { id: e.id },
            include: { lines: { orderBy: { position: "asc" } } },
          }),
        ).toEqual(e);
        await expect(postManualJournal(input())).rejects.toThrow(
          "INVALID_LEDGER_ACCOUNT",
        );
      } finally {
        await db.ledgerAccount.update({
          where: { id: e.lines[0].accountId },
          data: { isActive: true },
        });
      }
    });

    it("permits only one concurrent reversal and rejects a date before the original", async () => {
      acting.id = owner;
      const e = await postManualJournal(input());
      await expect(
        reversePostedJournal({
          ...reverse(e.id),
          effectiveAt: "2002-12-31T00:00:00Z",
        }),
      ).rejects.toThrow("INVALID_REVERSAL_DATE");
      const attempts = await Promise.allSettled([
        reversePostedJournal(reverse(e.id)),
        reversePostedJournal(reverse(e.id)),
      ]);
      expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
      expect(
        await db.journalEntry.count({ where: { reversalOfId: e.id } }),
      ).toBe(1);
    });

    it("blocks cross-market/currency accounts and forged identity without writes", async () => {
      acting.id = owner;
      const r = input();
      r.lines[0].accountId = input(ir).lines[0].accountId;
      await expect(postManualJournal(r)).rejects.toThrow(
        "INVALID_LEDGER_ACCOUNT",
      );
      r.lines[0].accountId = accounts.find(
        (a) => a.marketId === tr && a.currency === "USD",
      )!.id;
      await expect(postManualJournal(r)).rejects.toThrow(
        "INVALID_LEDGER_ACCOUNT",
      );
      await expect(
        postManualJournal({ ...input(), userId: owner }),
      ).rejects.toThrow();
      expect(
        await db.journalEntry.count({ where: { requestKey: r.requestKey } }),
      ).toBe(0);
    });

    it("the database rejects unfinished or unbalanced journals and rolls back all rows", async () => {
      const r = input(),
        n = normalizeJournal(r);
      await expect(
        db.journalEntry.create({
          data: {
            marketId: tr,
            requestKey: r.requestKey,
            requestHash: "b".repeat(64),
            memo: r.memo,
            createdById: owner,
            effectiveAt: n.effectiveAt,
            fxAsOf: n.fxAsOf,
          },
        }),
      ).rejects.toThrow();
      await expect(
        direct(r, (d) => {
          d.lines = { create: [n.lines[0]] };
        }),
      ).rejects.toThrow();
      await expect(
        direct(r, (d) => {
          d.lines = {
            create: [
              n.lines[0],
              {
                ...n.lines[1],
                credit: "100",
                creditTry: "100",
                creditUsd: "2.5",
              },
            ],
          };
        }),
      ).rejects.toThrow();
      await expect(
        direct(r, (d) => {
          d.lines = {
            create: [n.lines[0], { ...n.lines[1], creditUsd: "2.5001" }],
          };
        }),
      ).rejects.toThrow();
      expect(
        await db.journalEntry.count({ where: { requestKey: r.requestKey } }),
      ).toBe(0);
    });

    it("the database rejects cross-market lines, mixed rates and fabricated reversals", async () => {
      acting.id = owner;
      const r = input(),
        n = normalizeJournal(r);
      await expect(
        direct(r, (d) => {
          d.lines = {
            create: [
              n.lines[0],
              { ...n.lines[1], accountId: input(ir).lines[1].accountId },
            ],
          };
        }),
      ).rejects.toThrow();
      await expect(
        direct(r, (d) => {
          d.lines = {
            create: [n.lines[0], { ...n.lines[1], rateUsd: "0.025000000001" }],
          };
        }),
      ).rejects.toThrow();
      const original = await postManualJournal(r);
      await expect(
        direct(input(), (d) => {
          d.reversalOfId = original.id;
        }),
      ).rejects.toThrow();
    });

    it("sealed documents and account identities cannot be edited, deleted or extended", async () => {
      acting.id = owner;
      const e = await postManualJournal(input());
      await expect(
        db.journalEntry.update({
          where: { id: e.id },
          data: { memo: "Edited" },
        }),
      ).rejects.toThrow();
      await expect(
        db.journalEntry.delete({ where: { id: e.id } }),
      ).rejects.toThrow();
      await expect(
        db.journalLine.update({
          where: { id: e.lines[0].id },
          data: { debit: "200" },
        }),
      ).rejects.toThrow();
      await expect(
        db.journalLine.delete({ where: { id: e.lines[0].id } }),
      ).rejects.toThrow();
      const { id: _id, ...line } = e.lines[0];
      await expect(
        db.journalLine.create({ data: { ...line, position: 2 } }),
      ).rejects.toThrow();
      await expect(
        db.ledgerAccount.update({
          where: { id: line.accountId },
          data: { currency: "USD" },
        }),
      ).rejects.toThrow();
      await expect(
        db.ledgerAccount.delete({ where: { id: line.accountId } }),
      ).rejects.toThrow();
    });

    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES)
        for (const target of ["TR", "IR"]) {
          it(`finance.journal.post / ${name} / ${scope} / ${target}: real post and reversal guards`, async () => {
            const user = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!;
            const marketId = target === "TR" ? tr : ir;
            const allowed =
              granted(name, "finance.journal.post") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            acting.id = owner;
            const original = await postManualJournal(input(marketId));
            acting.id = user.id;
            const r = input(marketId),
              undo = reverse(original.id);
            if (allowed) {
              expect((await postManualJournal(r)).createdById).toBe(user.id);
              expect((await reversePostedJournal(undo)).createdById).toBe(
                user.id,
              );
            } else {
              await expect(postManualJournal(r)).rejects.toThrow();
              await expect(reversePostedJournal(undo)).rejects.toThrow();
              expect(
                await db.journalEntry.count({
                  where: {
                    requestKey: { in: [r.requestKey, undo.requestKey] },
                  },
                }),
              ).toBe(0);
            }
            const readable =
              granted(name, "finance.report.view") &&
              (scope === "in" || (scope === "market-out" && target === "TR"));
            if (readable)
              expect((await readJournalEntry(original.id)).id).toBe(
                original.id,
              );
            else await expect(readJournalEntry(original.id)).rejects.toThrow();
          });
        }

    it("matching deny and deactivation block retries, reads and reversals immediately", async () => {
      const user = subjects.find(
        (s) => s.name === "accountant" && s.scope === "in",
      )!;
      acting.id = user.id;
      const r = input(),
        e = await postManualJournal(r);
      const deny = await db.userPermissionOverride.create({
        data: {
          userId: user.id!,
          permission: "finance.journal.post",
          allow: false,
          scope: { marketId: tr },
        },
      });
      try {
        await expect(postManualJournal(r)).rejects.toThrow("FORBIDDEN");
        await expect(reversePostedJournal(reverse(e.id))).rejects.toThrow(
          "FORBIDDEN",
        );
      } finally {
        await db.userPermissionOverride.delete({ where: { id: deny.id } });
      }
      await db.user.update({
        where: { id: user.id! },
        data: { isActive: false },
      });
      try {
        await expect(postManualJournal(r)).rejects.toThrow("FORBIDDEN");
        await expect(readJournalEntry(e.id)).rejects.toThrow("FORBIDDEN");
      } finally {
        await db.user.update({
          where: { id: user.id! },
          data: { isActive: true },
        });
      }
      acting.id = owner;
      await expect(postManualJournal(r)).rejects.toThrow(
        "JOURNAL_REQUEST_CONFLICT",
      );
    });
  },
);
