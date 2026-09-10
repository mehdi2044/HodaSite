import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMedia: vi.fn(),
  findReplacement: vi.fn(),
  getBytes: vi.fn(),
  auth: vi.fn(),
  can: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    media: { findUnique: mocks.findMedia },
    mediaReplacement: { findUnique: mocks.findReplacement },
  },
}));
vi.mock("@/modules/integrations/storage", () => ({
  storage: { getBytes: mocks.getBytes },
}));
vi.mock("@/modules/auth", () => ({ auth: mocks.auth }));
vi.mock("@/modules/access", () => ({ can: mocks.can }));
import { GET } from "@/app/media/[...key]/route";

const bytes = Buffer.from("private backup fixture");
function media(kind = "backup") {
  return {
    id: "fixture-media",
    kind,
    storageKey: "media/2026/09/fixture.zip",
    mime: "application/zip",
    deletedAt: null,
    variants: {},
  };
}
function request(key = "media/2026/09/fixture.zip") {
  return GET(new Request("https://example.com/media/" + key), {
    params: Promise.resolve({ key: key.split("/") }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMedia.mockResolvedValue(media());
  mocks.findReplacement.mockResolvedValue(null);
  mocks.getBytes.mockResolvedValue(bytes);
  mocks.auth.mockResolvedValue({ user: { id: "staff" } });
  mocks.can.mockResolvedValue(false);
});

describe("private media download authorization", () => {
  it("rejects an uploader without backup.view before reading storage", async () => {
    mocks.can.mockImplementation(async (_id: string, permission: string) =>
      permission === "media.upload",
    );
    const response = await request();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.can).toHaveBeenCalledExactlyOnceWith("staff", "backup.view");
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it.each([null, { user: {} }, { user: { id: "" } }])(
    "rejects an absent or invalid authenticated subject: %j",
    async (session) => {
      mocks.auth.mockResolvedValue(session);
      const response = await request();
      expect(response.status).toBe(404);
      expect(mocks.can).not.toHaveBeenCalled();
      expect(mocks.getBytes).not.toHaveBeenCalled();
    },
  );

  it("does not require upload permission from an authorized backup reader", async () => {
    mocks.can.mockImplementation(async (_id: string, permission: string) =>
      permission === "backup.view",
    );
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.can).toHaveBeenCalledExactlyOnceWith("staff", "backup.view");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("keeps receipt bytes inaccessible even to a backup reader", async () => {
    mocks.findMedia.mockResolvedValue(media("receipt"));
    mocks.can.mockResolvedValue(true);
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it.each(["legacy", "replacement"])(
    "checks backup permission for a registered %s variant",
    async (kind) => {
      const key = kind === "legacy"
        ? "media/variants/fixture-media/640.webp"
        : "media/replacements/fixture-replacement/640.webp";
      const record = {
        ...media(),
        variants: { webp: { "640": { key, bytes: 8 } } },
      };
      mocks.findMedia.mockResolvedValue(record);
      mocks.findReplacement.mockResolvedValue({ media: record });
      mocks.can.mockImplementation(async (_id: string, permission: string) =>
        permission === "media.upload",
      );
      const response = await request(key);
      expect(response.status).toBe(404);
      expect(mocks.can).toHaveBeenCalledExactlyOnceWith("staff", "backup.view");
      expect(mocks.getBytes).not.toHaveBeenCalled();
    },
  );

  it("does not expose whether a denied backup has stored bytes", async () => {
    for (const stored of [null, bytes]) {
      mocks.getBytes.mockResolvedValue(stored);
      const response = await request();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it.each([null, { ...media(), deletedAt: new Date() }])(
    "does not stream missing or deleted media: %j",
    async (record) => {
      mocks.findMedia.mockResolvedValue(record);
      mocks.can.mockResolvedValue(true);
      expect((await request()).status).toBe(404);
      expect(mocks.getBytes).not.toHaveBeenCalled();
    },
  );

  it("returns 404 when an authorized backup's storage object is missing", async () => {
    mocks.can.mockResolvedValue(true);
    mocks.getBytes.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.can).toHaveBeenCalledExactlyOnceWith("staff", "backup.view");
  });

  it("does not serve an unregistered variant even to a backup reader", async () => {
    mocks.can.mockResolvedValue(true);
    expect((await request("media/variants/fixture-media/640.webp")).status).toBe(404);
    expect(mocks.getBytes).not.toHaveBeenCalled();
  });

  it("preserves anonymous public image streaming and cache behavior", async () => {
    mocks.findMedia.mockResolvedValue({ ...media("image"), mime: "image/jpeg" });
    mocks.auth.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.can).not.toHaveBeenCalled();
  });

  it("preserves immutable caching for registered public variants", async () => {
    const key = "media/variants/fixture-media/640.webp";
    mocks.findMedia.mockResolvedValue({
      ...media("image"),
      variants: { webp: { "640": { key, bytes: 8 } } },
    });
    const response = await request(key);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
