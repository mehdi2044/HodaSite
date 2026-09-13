import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import {
  evaluateAccess,
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/access";
import {
  journalHash,
  normalizeJournal,
  reversalRequest,
} from "./journal-input";

type Tx = Prisma.TransactionClient;
const include = { lines: { orderBy: { position: "asc" as const } } };
async function actor() {
  const userId = (await auth())?.user?.id;
  if (!userId) throw new UnauthorizedError();
  return userId;
}
async function authorize(
  tx: Tx,
  userId: string,
  marketId: string,
  write = true,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      overrides: true,
      roles: { include: { role: { include: { permissions: true } } } },
    },
  });
  const permission = write ? "finance.journal.post" : "finance.report.view";
  if (!evaluateAccess(user, permission, { marketId }))
    throw new ForbiddenError(permission, { marketId });
}
async function lockRequest(tx: Tx, marketId: string, requestKey: string) {
  // Lock ordering is request key, then original entry (for a reversal).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([marketId, requestKey])}, 0))`;
}
async function replay(
  tx: Tx,
  marketId: string,
  requestKey: string,
  requestHash: string,
) {
  const prior = await tx.journalEntry.findUnique({
    where: { marketId_requestKey: { marketId, requestKey } },
    include,
  });
  if (prior && prior.requestHash !== requestHash)
    throw new Error("JOURNAL_REQUEST_CONFLICT");
  return prior;
}
type EntryInput = ReturnType<typeof normalizeJournal>;
async function insert(
  tx: Tx,
  input: EntryInput,
  userId: string,
  requestHash: string,
  reversalOfId?: string,
) {
  const accountIds = [...new Set(input.lines.map((l) => l.accountId))].sort();
  const accounts = await tx.$queryRaw<
    { id: string; currency: string; isActive: boolean }[]
  >(Prisma.sql`
    SELECT id, currency, "isActive" FROM "LedgerAccount"
    WHERE "marketId"=${input.marketId} AND id IN (${Prisma.join(accountIds)}) ORDER BY id FOR SHARE
  `);
  if (
    accounts.length !== accountIds.length ||
    input.lines.some((line) => {
      const account = accounts.find((a) => a.id === line.accountId);
      return (
        !account ||
        account.currency !== line.currency ||
        (!reversalOfId && !account.isActive)
      );
    })
  )
    throw new Error("INVALID_LEDGER_ACCOUNT");
  const entry = await tx.journalEntry.create({
    data: {
      marketId: input.marketId,
      requestKey: input.requestKey,
      requestHash,
      memo: input.memo,
      effectiveAt: input.effectiveAt,
      fxAsOf: input.fxAsOf,
      createdById: userId,
      reversalOfId,
      lines: { create: input.lines },
    },
  });
  const posted = await tx.journalEntry.update({
    where: { id: entry.id },
    data: { status: "POSTED" },
    include,
  });
  await tx.auditLog.create({
    data: {
      userId,
      action: reversalOfId ? "finance.journal.reverse" : "finance.journal.post",
      entityType: "JournalEntry",
      entityId: entry.id,
      after: {
        marketId: input.marketId,
        reversalOfId: reversalOfId ?? null,
        requestHash,
      },
    },
  });
  return posted;
}

/** Internal application service. Actor IDs/permissions are never accepted from callers. */
export async function postManualJournal(raw: unknown) {
  const userId = await actor();
  const input = normalizeJournal(raw);
  const hash = journalHash({ kind: "MANUAL", userId, ...input });
  return db.$transaction(
    async (tx) => {
      await authorize(tx, userId, input.marketId);
      await lockRequest(tx, input.marketId, input.requestKey);
      await authorize(tx, userId, input.marketId);
      return (
        (await replay(tx, input.marketId, input.requestKey, hash)) ??
        (await insert(tx, input, userId, hash))
      );
    },
    { timeout: 15000 },
  );
}

export async function reversePostedJournal(raw: unknown) {
  const userId = await actor();
  const request = reversalRequest.parse(raw);
  return db.$transaction(
    async (tx) => {
      const original = await tx.journalEntry.findUnique({
        where: { id: request.entryId },
        include,
      });
      if (!original) throw new ForbiddenError("finance.journal.post");
      await authorize(tx, userId, original.marketId);
      const hash = journalHash({ kind: "REVERSAL", userId, ...request });
      await lockRequest(tx, original.marketId, request.requestKey);
      await authorize(tx, userId, original.marketId);
      const prior = await replay(
        tx,
        original.marketId,
        request.requestKey,
        hash,
      );
      if (prior) return prior;
      await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE id=${original.id} FOR UPDATE`;
      await authorize(tx, userId, original.marketId);
      if (
        original.reversalOfId ||
        original.status !== "POSTED" ||
        (await tx.journalEntry.findUnique({
          where: { reversalOfId: original.id },
        }))
      )
        throw new Error("JOURNAL_ALREADY_REVERSED");
      if (request.effectiveAt < original.effectiveAt)
        throw new Error("INVALID_REVERSAL_DATE");
      const input = normalizeJournal({
        marketId: original.marketId,
        requestKey: request.requestKey,
        memo: request.memo,
        effectiveAt: request.effectiveAt.toISOString(),
        fxAsOf: original.fxAsOf.toISOString(),
        lines: original.lines.map((line) => ({
          accountId: line.accountId,
          currency: line.currency,
          debit: line.credit.toFixed(4),
          credit: line.debit.toFixed(4),
          rateTry: line.rateTry.toFixed(12),
          rateUsd: line.rateUsd.toFixed(12),
        })),
      });
      return insert(tx, input, userId, hash, original.id);
    },
    { timeout: 15000 },
  );
}

export async function readJournalEntry(id: string) {
  const userId = await actor();
  if (typeof id !== "string" || !id || id.length > 100)
    throw new ForbiddenError("finance.report.view");
  return db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findUnique({
      where: { id },
      include: { ...include, reversal: { select: { id: true } } },
    });
    if (!entry) throw new ForbiddenError("finance.report.view");
    await authorize(tx, userId, entry.marketId, false);
    return entry;
  });
}
