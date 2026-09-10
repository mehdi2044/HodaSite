import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/modules/customers", () => ({ currentCustomer: async () => null }));
import { POST } from "@/app/api/cron/tick/route";
afterEach(() => vi.unstubAllEnvs());
it("fails closed when CRON_SECRET is absent, including the literal undefined token", async () => {
  vi.stubEnv("CRON_SECRET", undefined);
  const response = await POST(
    new Request("http://localhost/api/cron/tick", {
      method: "POST",
      headers: { authorization: "Bearer undefined" },
    }),
  );
  expect(response.status).toBe(401);
});
it("rejects empty configuration and incorrect credentials before running any job", async () => {
  for (const secret of ["", "configured-secret"]) {
    vi.stubEnv("CRON_SECRET", secret);
    const response = await POST(
      new Request("http://localhost/api/cron/tick", {
        method: "POST",
        headers: { authorization: "Bearer " },
      }),
    );
    expect(response.status).toBe(401);
  }
});
