import { beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { media } }));
import {
  findCategoryCover,
  findCategoryCovers,
} from "@/modules/catalog/queries";

describe("public category cover eligibility", () => {
  beforeEach(() => {
    media.findMany.mockReset();
  });
  it("rejects video, unavailable and deleted assets at the query boundary", async () => {
    const rows = [
      { id: "valid", kind: "image", status: "READY", deletedAt: null },
      { id: "video", kind: "video", status: "READY", deletedAt: null },
      {
        id: "processing",
        kind: "image",
        status: "PROCESSING",
        deletedAt: null,
      },
      { id: "failed", kind: "image", status: "FAILED", deletedAt: null },
      { id: "deleted", kind: "image", status: "READY", deletedAt: new Date() },
    ];
    media.findMany.mockImplementation(async ({ where }) =>
      rows.filter(
        (row) =>
          where.id.in.includes(row.id) &&
          row.kind === where.kind &&
          row.status === where.status &&
          row.deletedAt === where.deletedAt,
      ),
    );
    expect(await findCategoryCovers(rows.map((row) => row.id))).toEqual([
      rows[0],
    ]);
    expect(await findCategoryCover("video")).toBeNull();
    expect(await findCategoryCover("valid")).toEqual(rows[0]);
  });
  it("batches distinct references and avoids a query for absent covers", async () => {
    media.findMany.mockResolvedValue([]);
    expect(await findCategoryCovers([null, null])).toEqual([]);
    expect(await findCategoryCover(null)).toBeNull();
    expect(media.findMany).not.toHaveBeenCalled();
    await findCategoryCovers(["cover", null, "cover"]);
    expect(media.findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: { in: ["cover"] },
        kind: "image",
        status: "READY",
        deletedAt: null,
      },
    });
  });
});
