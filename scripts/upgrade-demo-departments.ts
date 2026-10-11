import { PrismaClient } from "@prisma/client";
import { upgradeStyleComposition } from "../prisma/style-seed";
import { requireCompleteStyleCatalog } from "./style-demo-catalog";

// Existing preview only: no general seed, commercial records, stock or media writes.
const db = new PrismaClient();
async function main() {
  try {
    await db.$transaction(async (tx) => {
      await requireCompleteStyleCatalog(tx);
      await upgradeStyleComposition(tx);
    }, { isolationLevel: "Serializable" });
    console.log(
      "Untouched demo composition checked; merchant edits and market overrides preserved. No products, prices, stock or payments changed.",
    );
  } catch {
    console.error(
      "Demo composition check failed. Verify the existing demo catalog and database; no general seed was run.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main();
