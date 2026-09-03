import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Integration specs need a reachable Postgres (DATABASE_URL); they
    // skip themselves when there is none, so they run in CI and are inert
    // on a machine without a database.
    include: ["tests/unit/**/*.spec.ts", "tests/integration/**/*.spec.ts"],
    testTimeout: 15_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
