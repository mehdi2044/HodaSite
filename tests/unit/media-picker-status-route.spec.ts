import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  can: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ auth: mocks.auth }));
vi.mock("@/modules/access", () => ({ can: mocks.can }));
vi.mock("@/lib/db", () => ({
  db: { media: { findMany: mocks.findMany, count: mocks.count } },
}));
import { GET } from "@/app/api/admin/media/route";
const req = (id = "cover") =>
  new Request(`https://example.com/api/admin/media?kind=image&id=${id}`);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  mocks.can.mockResolvedValue(true);
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
describe("exact media status lookup", () => {
  it("retains permission checks before any query", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { id: "staff" } });
    mocks.can.mockResolvedValue(false);
    expect((await GET(req())).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("rejects an invalid identifier before the media query", async () => {
    expect((await GET(req("a".repeat(101)))).status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("looks up the exact image while retaining private-media and deletion exclusions", async () => {
    expect((await GET(req())).status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        where: {
          id: "cover",
          kind: "image",
          deletedAt: null,
          AND: [
            { kind: { notIn: ["receipt", "backup", "invoice", "expense"] } },
          ],
        },
      }),
    );
  });
});
