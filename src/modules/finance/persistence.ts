import { Prisma } from "@prisma/client";
import { normalizeJournal, journalHash } from "./journal-input";
type Tx = Prisma.TransactionClient;
const include = { lines: { orderBy: { position: "asc" as const } } };
export async function lockRequest(
  tx: Tx,
  marketId: string,
  requestKey: string,
) {
  // Lock ordering is request key, then original entry (for a reversal).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([marketId, requestKey])}, 0))`;
}
export async function replay(
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
export async function insert(
  tx: Tx,
  input: EntryInput,
  userId: string | null,
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

/** Internal transaction primitive: only authorized domain services may call it.
 * Never expose this function as a Server Action or accept a caller-supplied actor over HTTP. */
export async function postDomainJournal(
  tx: Tx,
  raw: unknown,
  userId: string | null,
) {
  const input = normalizeJournal(raw);
  // A domain event is identified by its immutable payload, not the staff member
  // who later retries it. The first actor remains in the entry and audit trail.
  const hash = journalHash({ kind: "DOMAIN", ...input });
  await lockRequest(tx, input.marketId, input.requestKey);
  return (
    (await replay(tx, input.marketId, input.requestKey, hash)) ??
    insert(tx, input, userId, hash)
  );
}
