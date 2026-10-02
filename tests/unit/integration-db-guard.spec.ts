import { afterEach, describe, expect, it, vi } from "vitest";
import setup from "../setup/global-setup";

afterEach(() => vi.unstubAllEnvs());
describe("integration database guard", () => {
  it("rejects an app database before making any connection", async () => {
    vi.stubEnv(
      "TEST_DATABASE_URL",
      "postgresql://example:do-not-print@localhost:1/preview",
    );
    await expect(setup()).rejects.toThrow("dedicated database");
    try {
      await setup();
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print");
    }
  });
  it("allows unit-only execution without creating a DB client", async () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    await expect(setup()).resolves.toBeUndefined();
  });
});
