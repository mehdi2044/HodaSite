import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Session snapshots pin the exact original object until dispatch settles. */
export async function fittingUsesImage(
  storageKey: string,
  client: Prisma.TransactionClient = db,
) {
  const [row] = await client.$queryRaw<{ used: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "FittingSession"
      WHERE status IN ('QUEUED','RUNNING') AND jsonb_path_exists(
        snapshot, '$.**.storageKey ? (@ == $key)',
        jsonb_build_object('key', ${storageKey}::text))) AS used`;
  return row.used;
}
