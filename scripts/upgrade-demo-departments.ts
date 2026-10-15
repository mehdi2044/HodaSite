import { PrismaClient } from "@prisma/client";
import { upgradeStyleComposition } from "../prisma/style-seed";

// Existing preview only: no general seed, commercial records, stock or media writes.
const db = new PrismaClient();
async function main() {
  try {
    const result = await upgradeStyleComposition(db);
    if (result === "incomplete")
      throw new Error("The complete style demo catalog is required");
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
