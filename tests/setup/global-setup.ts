import { PrismaClient } from "@prisma/client";

// Runs once before any test file. Integration specs skip themselves when
// the database is unreachable (see their own `db.$queryRaw` probe), which
// is silent otherwise — this prints one clear warning up front instead of
// leaving it to be inferred from a lower pass count.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.warn(
      `\n⚠ integration tests SKIPPED: database not reachable at ${url}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
