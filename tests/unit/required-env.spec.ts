import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

describe("required runtime environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails fast when MAINTENANCE_SECRET is missing", async () => {
    vi.stubEnv("AUTH_SECRET", "test-auth");
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/test");
    vi.stubEnv("MAINTENANCE_SECRET", "");
    await expect(register()).rejects.toThrow("MAINTENANCE_SECRET");
  });

  it("accepts all required runtime variables", async () => {
    vi.stubEnv("AUTH_SECRET", "test-auth");
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/test");
    vi.stubEnv("MAINTENANCE_SECRET", "test-maintenance");
    await expect(register()).resolves.toBeUndefined();
  });
});
