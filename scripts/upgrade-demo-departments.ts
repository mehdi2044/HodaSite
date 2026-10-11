import { PrismaClient } from "@prisma/client";
import { styleProducts, upgradeStyleComposition } from "../prisma/style-seed";

// Existing preview only: no general seed, commercial records, stock or media writes.
const db = new PrismaClient();
async function main() {
  try {
    const products = await db.product.count({
      where: {
        id: { in: styleProducts.map(([key]) => `seed-style-v2-${key}`) },
        deletedAt: null,
        status: "ACTIVE",
      },
    });
    if (products !== styleProducts.length)
      throw new Error("The complete style demo catalog is required");
    await upgradeStyleComposition(db);
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
