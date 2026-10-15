import { db } from "@/lib/db";
/** Called only within the authenticated cron's existing maintenance/drain gate. */
export async function cleanupExpiredHomepagePreviews() {
  const removed =
    await db.$executeRaw`DELETE FROM "HomepagePreview" WHERE id IN (SELECT id FROM "HomepagePreview" WHERE "expiresAt" <= clock_timestamp() ORDER BY "expiresAt",id LIMIT 500)`;
  return removed;
}
