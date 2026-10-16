import { defineConfig } from "@playwright/test";

// MODA4 visual-fidelity gate (docs/design/moda4-redesign/FIDELITY_SPEC.md).
// MODA4_FIDELITY_TARGET=prototype needs no server; the default "app" target expects the
// storefront on MODA4_APP_URL (default http://127.0.0.1:3000), started like the e2e suite.
const app = process.env.MODA4_FIDELITY_TARGET !== "prototype";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/fidelity",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [["list"]],
  // Keep Playwright's own artifacts apart: it wipes outputDir on every run, and the fidelity
  // report in test-results/moda4-fidelity/ must survive so prototype and app can be compared.
  outputDir: "test-results/.fidelity-artifacts",
  use: {
    browserName: "chromium",
    launchOptions: process.env.MODA4_CHROMIUM
      ? { executablePath: process.env.MODA4_CHROMIUM }
      : {},
    contextOptions: { reducedMotion: "no-preference" },
  },
  webServer:
    app && !process.env.MODA4_APP_URL
      ? {
          command: isCI
            ? "cp -r .next/static .next/standalone/.next/ && (cp -r public .next/standalone/ 2>/dev/null || true) && mkdir -p /tmp/hoda-media && MEDIA_DIR=/tmp/hoda-media HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js"
            : "pnpm dev",
          url: "http://127.0.0.1:3000/fa",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        }
      : undefined,
});
