"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action-result";
import { withMutation } from "@/lib/mutation-gate";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth";
import { assertCan, ForbiddenError, UnauthorizedError } from "@/modules/access";
import {
  postManualJournal,
  reversePostedJournal,
} from "@/modules/finance/ledger";
import { reviewManualJournal } from "@/modules/finance/ledger-admin";
import type { DisplayLine } from "@/modules/finance/journal-display";

type Failure = { ok: false; code: string };
async function authorizeRequest(raw: unknown, reversal = false) {
  const userId = (await auth())?.user?.id;
  if (!userId) throw new UnauthorizedError();
  let marketId: string;
  const id = z.string().min(1).max(100);
  if (reversal) {
    const { entryId } = z.object({ entryId: id }).parse(raw);
    const entry = await db.journalEntry.findUnique({
      where: { id: entryId },
      select: { marketId: true },
    });
    if (!entry) throw new ForbiddenError("finance.journal.post");
    marketId = entry.marketId;
  } else marketId = z.object({ marketId: id }).parse(raw).marketId;
  // Boundary check; the ledger also checks again inside its locked transaction.
  await assertCan(userId, "finance.journal.post", { marketId });
}
const known = new Set([
  "INVALID_JOURNAL_SIDE",
  "INVALID_IDENTITY_RATE",
  "INCONSISTENT_JOURNAL_RATES",
  "AMOUNT_OVERFLOW",
  "UNBALANCED_JOURNAL",
  "INVALID_LEDGER_ACCOUNT",
  "JOURNAL_REQUEST_CONFLICT",
  "JOURNAL_ALREADY_REVERSED",
  "INVALID_REVERSAL_DATE",
]);
async function execute<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | Failure> {
  let value: T | undefined;
  try {
    const result = await runAction(async () => {
      value = await fn();
    });
    if (!result.ok) return { ok: false, code: result.code };
    return { ok: true, value: value! };
  } catch (error) {
    // An unexpected/transport failure may follow a committed transaction. Keep
    // the request key and payload locked in the UI, so retry cannot double-post.
    return {
      ok: false,
      code:
        error instanceof Error && known.has(error.message)
          ? error.message
          : "UNKNOWN",
    };
  }
}
export async function reviewJournal(
  raw: unknown,
): Promise<{ ok: true; value: DisplayLine[] } | Failure> {
  return execute(async () => {
    await authorizeRequest(raw);
    return reviewManualJournal(raw);
  });
}
export async function postJournal(raw: unknown) {
  const result = await execute(async () => {
    const { request, confirm } = z
      .object({ request: z.unknown(), confirm: z.literal(true) })
      .strict()
      .parse(raw);
    void confirm;
    await authorizeRequest(request);
    return (await withMutation(() => postManualJournal(request))).id;
  });
  // A cache-refresh failure must never turn a successful post into an editable draft.
  if (result.ok) {
    try {
      revalidatePath("/admin/finance/journal");
    } catch {
      /* posting succeeded */
    }
  }
  return result;
}
export async function reverseJournal(raw: unknown) {
  const result = await execute(async () => {
    const { request } = z
      .object({ request: z.unknown(), confirm: z.literal(true) })
      .strict()
      .parse(raw);
    await authorizeRequest(request, true);
    return (await withMutation(() => reversePostedJournal(request))).id;
  });
  if (result.ok) {
    try {
      revalidatePath("/admin/finance/journal", "layout");
    } catch {
      /* reversal succeeded */
    }
  }
  return result;
}
