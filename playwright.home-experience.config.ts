import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/acceptance",
  testMatch: "**/home-experience-*.spec.ts",
  timeout: 90000,
  retries: 0,
  workers: 1,
  outputDir:
    process.env.HOME_TEST_OUTPUT_DIR ??
    `test-results/home-experience-${Date.now()}`,
  use: {
    baseURL: process.env.HOME_APP_URL ?? "http://localhost:3301",
    viewport: { width: 390, height: 900 },
    trace: "on",
    screenshot: "only-on-failure",
  },
});
