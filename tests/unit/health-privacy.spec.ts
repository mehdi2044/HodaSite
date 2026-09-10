import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(async () => {
      throw new Error(
        "postgresql://private-user:secret-password@private-host/db",
      );
    }),
  },
}));
import { GET } from "@/app/api/health/route";
it("never includes database connection details in public health errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("database unavailable");
    expect(body).not.toMatch(/private-user|secret-password|private-host/);
  } finally {
    log.mockRestore();
  }
});
