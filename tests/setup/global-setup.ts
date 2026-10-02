import { PrismaClient } from "@prisma/client";

// Runs once before any test file, deciding what the integration specs below
// will do (they gate on `Boolean(process.env.TEST_DATABASE_URL)`):
//   - TEST_DATABASE_URL unset      -> they skip; we print why, once, up front.
//   - TEST_DATABASE_URL unreachable -> fail the whole run loudly, not skip.
//   - TEST_DATABASE_URL reachable   -> they run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log(
      "\nℹ integration tests skipped: TEST_DATABASE_URL not set (unit tests only)\n",
    );
    return;
  }

  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error(
      "TEST_DATABASE_URL must use a dedicated database whose name ends in _test",
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (cause) {
    throw new Error(
      "integration tests FAILED: the dedicated test database is not reachable",
      { cause },
    );
  } finally {
    await prisma.$disconnect();
  }
}
