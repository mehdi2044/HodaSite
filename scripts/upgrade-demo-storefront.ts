import { PrismaClient } from "@prisma/client";
import { storage } from "../src/modules/integrations/storage";
import { seedFashionStorefront } from "../prisma/fashion-seed";

// Operator CLI for an existing preview. Unlike the general seed, this never
// updates users, prices, market visibility, variants, stock or payment settings.
const db = new PrismaClient();
async function main() {
  try {
    await seedFashionStorefront(db, (key, bytes) =>
      storage.put(key, bytes, "image/webp"),
    );
    console.log(
      "Demo storefront checked. Eligible sample images upgraded; merchant edits preserved. Restart the app to refresh cached homepage content.",
    );
  } catch {
    console.error(
      "Demo upgrade failed. Check database and media storage; no credentials are included in this report.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main();
