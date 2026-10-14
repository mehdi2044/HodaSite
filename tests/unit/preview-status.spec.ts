import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  can: vi.fn(),
  aggregate: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ auth: mock.auth }));
vi.mock("@/modules/access", () => ({ can: mock.can }));
vi.mock("@/lib/db", () => ({
  db: {
    siteSettings: { aggregate: mock.aggregate },
    themeSettings: { aggregate: mock.aggregate },
    homepage: { aggregate: mock.aggregate },
    menu: { aggregate: mock.aggregate },
    menuItem: { aggregate: mock.aggregate },
    category: { aggregate: mock.aggregate },
    catalogCutout: { aggregate: mock.aggregate },
    media: { aggregate: mock.aggregate },
    integration: { aggregate: mock.aggregate },
  },
}));
import { GET } from "@/app/api/admin/preview-status/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HODASITE_PREVIEW", "1");
  mock.auth.mockResolvedValue({ user: { id: "operator" } });
  mock.can.mockResolvedValue(true);
  mock.aggregate.mockResolvedValue({
    _max: { updatedAt: new Date(0) },
    _count: 1,
  });
});
afterEach(() => vi.unstubAllEnvs());

it("is disabled by default and rejects unauthenticated or unauthorized readers before DB access", async () => {
  vi.stubEnv("HODASITE_PREVIEW", "0");
  expect((await GET()).status).toBe(404);
  vi.stubEnv("HODASITE_PREVIEW", "1");
  mock.auth.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  mock.auth.mockResolvedValue({ user: { id: "operator" } });
  mock.can.mockResolvedValue(false);
  expect((await GET()).status).toBe(403);
  expect(mock.can).toHaveBeenCalledWith("operator", "system.health.view");
  expect(mock.aggregate).not.toHaveBeenCalled();
});

it("returns private metadata whose revision changes after committed content updates", async () => {
  const first = await GET();
  expect(first.headers.get("Cache-Control")).toBe("private, no-store");
  expect(first.headers.get("X-Robots-Tag")).toContain("noindex");
  const before = await first.json();
  expect(before.contentRevision).toMatch(/^[a-f0-9]{16}$/);
  mock.aggregate.mockResolvedValue({
    _max: { updatedAt: new Date(1000) },
    _count: 1,
  });
  expect((await (await GET()).json()).contentRevision).not.toBe(
    before.contentRevision,
  );
});

it("reports unavailable without revealing internal connection errors", async () => {
  mock.aggregate.mockRejectedValue(new Error("private database connection"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"error":"unavailable"}');
});
