import { PrismaClient } from "@prisma/client";
import { seedEditorialFixtures } from "../tests/fixtures/editorial";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    database !== process.argv[2] ||
    !/^(?:curated|test)[a-z0-9_]*$/.test(database)
  )
    throw new Error(
      "Pass the exact name of the disposable curated or test database",
    );
  const client = new PrismaClient();
  try {
    await seedEditorialFixtures(client);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
