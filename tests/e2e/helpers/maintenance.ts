import type { APIRequestContext } from "@playwright/test";

/**
 * Force maintenance off via the ops-secret endpoint (bypasses the admin UI
 * entirely — fast, and independent of any other spec file's own cleanup).
 * Specs that assert on normal storefront behavior call this first: with
 * `workers: 1` all spec files share one server process and its maintenance
 * state, and Playwright does not guarantee file execution order, so a test
 * elsewhere that turns maintenance on must never be able to leak into this
 * one silently (a 503 maintenance page looks like "everything is broken" —
 * no market cookie, no locale redirect, no theme CSS vars — which is exactly
 * the failure mode this guards against).
 */
export async function ensureMaintenanceOff(request: APIRequestContext) {
  await request.post("/api/system/maintenance", {
    headers: {
      "x-maintenance-secret":
        process.env.MAINTENANCE_SECRET ?? "test-maintenance",
    },
    data: "state=off",
  });
}
