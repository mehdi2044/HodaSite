import { defineConfig, devices } from "@playwright/test";

// Opt-in against an already-running, isolated v32 restoration; no seed or webServer.
if (!process.env.M402_APP_URL) throw new Error("M402_APP_URL is required");
export default defineConfig({
  testDir: "tests/acceptance",
  testMatch: "m402-v32-recovery.spec.ts",
  workers: 2,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: process.env.M402_OUTPUT_DIR ?? "test-results/m402-recovery",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.M402_RESULTS ?? "test-results/m402-results.json",
      },
    ],
  ],
  use: {
    ...devices["Pixel 7"],
    baseURL: process.env.M402_APP_URL,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    trace: "on",
    launchOptions: process.env.M402_CHROMIUM
      ? { executablePath: process.env.M402_CHROMIUM }
      : {},
  },
});
