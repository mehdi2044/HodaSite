import { test, expect } from "@playwright/test";

test("/api/health reports db/storage/lastBackup/lastFx and 200 when the DB is up", async ({
  request,
}) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ db: "ok", lastFx: null });
  expect(body).toHaveProperty("storage");
  expect(body).toHaveProperty("lastBackup");
  expect(body).not.toHaveProperty("reason");
});
