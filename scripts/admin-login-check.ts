import { PrismaClient } from "@prisma/client";
import { inspectAdminLogin } from "./lib/admin-login-check";
const db = new PrismaClient();
async function localAppearance() {
  try {
    const response = await fetch("http://127.0.0.1:3000/fa", {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();
    return {
      reachable: response.ok,
      httpStatus: response.status,
      mobileNavigationPresent: html.includes(
        'data-testid="mobile-bottom-navigation"',
      ),
      pwaManifestLinked: html.includes('rel="manifest"'),
    };
  } catch {
    return { reachable: false };
  }
}
async function main() {
  try {
    console.log(
      JSON.stringify(
        {
          ...(await inspectAdminLogin(db, process.argv[2])),
          localStorefront: await localAppearance(),
        },
        null,
        2,
      ),
    );
  } catch {
    // Prisma messages can include connection strings; never print the raw error.
    console.error(
      JSON.stringify({
        databaseReachable: false,
        diagnostic:
          "Check running database and pending migrations; no data was changed.",
      }),
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main();
