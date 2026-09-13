import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import {
  assertCan,
  can,
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/access";
import { visibleFinanceMarkets } from "./service";
import { reportFilter } from "./reports";
import { normalizeJournal } from "./journal-input";
import { readJournalEntry } from "./ledger";

async function actor() {
  const id = (await auth())?.user?.id;
  if (!id) throw new UnauthorizedError();
  return id;
}

/** Only authorized markets/accounts are sent to the browser, including deep links. */
export async function journalFormOptions() {
  const userId = await actor();
  const all = await db.market.findMany({
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const allowed = await Promise.all(
    all.map((m) => can(userId, "finance.journal.post", { marketId: m.id })),
  );
  const markets = all.filter((_, i) => allowed[i]);
  if (!markets.length) throw new ForbiddenError("finance.journal.post");
  const accounts = await db.ledgerAccount.findMany({
    where: { marketId: { in: markets.map((m) => m.id) }, isActive: true },
    select: {
      id: true,
      marketId: true,
      code: true,
      currency: true,
      nameI18n: true,
    },
    orderBy: [{ code: "asc" }, { currency: "asc" }],
  });
  return { markets, accounts };
}

/** A review is not a reservation: posting rechecks every permission and account. */
export async function reviewManualJournal(raw: unknown) {
  const userId = await actor();
  const input = normalizeJournal(raw);
  await assertCan(userId, "finance.journal.post", { marketId: input.marketId });
  const accounts = await db.ledgerAccount.findMany({
    where: {
      id: { in: input.lines.map((l) => l.accountId) },
      marketId: input.marketId,
      isActive: true,
    },
    select: { id: true, currency: true },
  });
  if (
    input.lines.some(
      (l) =>
        !accounts.some(
          (a) => a.id === l.accountId && a.currency === l.currency,
        ),
    )
  )
    throw new Error("INVALID_LEDGER_ACCOUNT");
  return input.lines;
}

export async function journalList(raw: unknown) {
  const userId = await actor();
  const markets = await visibleFinanceMarkets(userId);
  if (!markets.length) throw new ForbiddenError("finance.report.view");
  const query = z
    .object({
      from: z.unknown().optional(),
      to: z.unknown().optional(),
      marketId: z.unknown().optional(),
      cursor: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(raw);
  const filter = reportFilter({
    from: query.from,
    to: query.to,
    marketId: query.marketId,
  });
  if (filter.marketId && !markets.some((m) => m.id === filter.marketId))
    throw new ForbiddenError("finance.report.view");
  const where = {
    marketId: {
      in: filter.marketId ? [filter.marketId] : markets.map((m) => m.id),
    },
    effectiveAt: { gte: filter.start, lt: filter.end },
    status: "POSTED",
  };
  const cursor = query.cursor
    ? await db.journalEntry.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true, createdAt: true },
      })
    : null;
  if (query.cursor && !cursor) throw new Error("INVALID_JOURNAL_CURSOR");
  const entries = await db.journalEntry.findMany({
    where: {
      ...where,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 31,
    select: {
      id: true,
      marketId: true,
      memo: true,
      effectiveAt: true,
      reversalOfId: true,
      reversal: { select: { id: true } },
      _count: { select: { lines: true } },
    },
  });
  const rows = entries.slice(0, 30);
  return {
    markets,
    filter,
    rows,
    next: entries.length > 30 ? rows.at(-1)!.id : null,
    canPost: (
      await Promise.all(
        markets.map((m) =>
          can(userId, "finance.journal.post", { marketId: m.id }),
        ),
      )
    ).some(Boolean),
  };
}

export async function journalDetail(id: string) {
  const entry = await readJournalEntry(id);
  const userId = await actor();
  const accounts = await db.ledgerAccount.findMany({
    where: {
      marketId: entry.marketId,
      id: { in: entry.lines.map((l) => l.accountId) },
    },
    select: { id: true, code: true, nameI18n: true },
  });
  const market = await db.market.findUniqueOrThrow({
    where: { id: entry.marketId },
    select: { code: true },
  });
  return {
    entry,
    accounts,
    market,
    canReverse:
      !entry.reversalOfId &&
      !entry.reversal &&
      (await can(userId, "finance.journal.post", { marketId: entry.marketId })),
  };
}
