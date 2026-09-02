import { defineConfig, devices } from "@playwright/test";

// C3: in CI, test the built artifact (`next build` runs in the previous CI
// step), not `next dev`. The dev server compiles each route on first request,
// which on a 2-core runner blows past the webServer start-up budget and the
// per-test timeout. `next start` is unusable here because `next.config.ts`
// sets `output: "standalone"`, so we assemble the standalone bundle the same
// way the Dockerfile does (static assets + public/) and run its server.
// Locally, keep the dev server.
const isCI = !!process.env.CI;
const ciServer =
  "cp -r .next/static .next/standalone/.next/ && " +
  "(cp -r public .next/standalone/ 2>/dev/null || true) && " +
  "mkdir -p /tmp/hoda-media && " +
  "MEDIA_DIR=/tmp/hoda-media HOSTNAME=127.0.0.1 PORT=3000 " +
  "node .next/standalone/server.js";

export default defineConfig({
  testDir: "tests/e2e",
  // Some specs toggle server-global maintenance state; run serially in CI so
  // that global state is never shared across parallel workers.
  workers: isCI ? 1 : undefined,
  use: {
    baseURL: "http://127.0.0.1:3000",
    // Mobile-first viewport on Chromium — CI installs only the chromium
    // browser (`playwright install --with-deps chromium`); iPhone devices
    // pull in WebKit, which isn't downloaded.
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: isCI ? ciServer : "pnpm dev",
    // This app has no "/" route (storefront lives under /[locale]); probe a
    // real page so Playwright sees a 2xx instead of waiting on 404 forever.
    url: "http://127.0.0.1:3000/fa",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
