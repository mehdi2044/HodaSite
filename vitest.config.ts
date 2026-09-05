import { defineConfig } from "vitest/config";
import path from "node:path";

try {
  // Picks up TEST_DATABASE_URL from a local .env (see .env.example) without
  // needing it exported manually. Absent in CI, where env vars are already
  // set directly — loadEnvFile() throws if there's no .env file there.
  process.loadEnvFile();
} catch {
  // no .env file — fine, env vars come from the process environment (CI).
}

// Integration specs need a reachable Postgres. TEST_DATABASE_URL lets
// `pnpm test` run them from the host against the port docker-compose.dev.yml
// publishes, without touching DATABASE_URL itself.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.spec.ts", "tests/integration/**/*.spec.ts"],
    testTimeout: 15_000,
    env: testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {},
    globalSetup: ["./tests/setup/global-setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
