import { test, expect } from "@playwright/test";

const MAINT = process.env.MAINTENANCE_SECRET ?? "test-maintenance";
const CRON = process.env.CRON_SECRET ?? "test-cron";

test.describe.configure({ mode: "serial" });

async function setMaintenance(
  request: import("@playwright/test").APIRequestContext,
  state: "on" | "off",
) {
  const res = await request.post("/api/system/maintenance", {
    headers: { "x-maintenance-secret": MAINT },
    data: `state=${state}`,
  });
  expect(res.ok()).toBeTruthy();
}

test.afterAll(async ({ request }) => {
  await setMaintenance(request, "off");
});

test("GET /api/system/maintenance reports a real in-flight count", async ({
  request,
}) => {
  const res = await request.get("/api/system/maintenance", {
    headers: { "x-maintenance-secret": MAINT },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.inFlight).toBe("number");
});

test("write requests are rejected with 503 while maintenance is on", async ({
  request,
}) => {
  await setMaintenance(request, "on");

  const blocked = await request.post("/api/cron/tick", {
    headers: { authorization: `Bearer ${CRON}` },
  });
  expect(blocked.status()).toBe(503);

  await setMaintenance(request, "off");

  const ok = await request.post("/api/cron/tick", {
    headers: { authorization: `Bearer ${CRON}` },
  });
  expect(ok.status()).toBe(200);
});
