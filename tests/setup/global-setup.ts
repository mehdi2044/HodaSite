import { PrismaClient } from "@prisma/client";
import { isolatedTestDatabases } from "../helpers/isolated-database";

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

  const dedicated = isolatedTestDatabases(url, [
    { url: process.env.EDITORIAL_TEST_DATABASE_URL, label: "Editorial" },
    {
      url: process.env.FITTING_EXCHANGE_TEST_DATABASE_URL,
      label: "Fitting exchange",
    },
    { url: process.env.COMMERCE_TEST_DATABASE_URL, label: "Commerce cron" },
  ]);
  for (const isolated of dedicated) {
    const fixture = new PrismaClient({
      datasources: { db: { url: isolated } },
    });
    try {
      await fixture.$queryRaw`SELECT 1`;
    } finally {
      await fixture.$disconnect();
    }
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
