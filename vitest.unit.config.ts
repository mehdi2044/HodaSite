import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately never loads .env or global DB setup. Safe even when the host's
// shell/.env has production or preview credentials configured.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.spec.ts"],
    env: {
      TEST_DATABASE_URL: "",
      DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/unit_disabled",
    },
    setupFiles: ["./tests/setup/vitest.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
