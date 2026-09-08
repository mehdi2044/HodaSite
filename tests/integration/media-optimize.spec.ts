import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { MAX_JOB_ATTEMPTS } from "@/modules/jobs";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

// LocalStorage reads MEDIA_DIR once at module-load time to build its
// singleton, and .env's MEDIA_DIR=/data/media is a path that only exists
// inside the app/ops containers — so this suite points it at a scratch temp
// dir and imports the modules under test only after that env var is set.
describe.skipIf(!hasDb)("media-optimize worker", () => {
  let tmpDir: string;
  let mediaOptimizeHandler: typeof import("@/modules/media/optimize").mediaOptimizeHandler;
  let storagePut: typeof import("@/modules/integrations/storage").storage.put;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hoda-media-test-"));
    process.env.MEDIA_DIR = tmpDir;
    process.env.STORAGE_PROVIDER = "local";
    const storageModule = await import("@/modules/integrations/storage");
    storagePut = storageModule.storage.put.bind(storageModule.storage);
    ({ mediaOptimizeHandler } = await import("@/modules/media/optimize"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await db.media.deleteMany({
      where: { originalName: { startsWith: "test-" } },
    });
  });

  async function jpeg(width: number, height: number): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: { width, height, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
  }

  function fakeJob(mediaId: string, attempts = 0) {
    return {
      id: "job-x",
      type: "media-optimize",
      payload: { mediaId },
      attempts,
    };
  }

  async function createMedia(opts: {
    storageKey: string;
    originalName: string;
    bytes: number;
  }) {
    return db.media.create({
      data: {
        kind: "image",
        storageKey: opts.storageKey,
        originalName: opts.originalName,
        url: `/media/${opts.storageKey}`,
        bytes: opts.bytes,
        mime: "image/jpeg",
        status: "PROCESSING",
      },
    });
  }

  it("generates webp+avif variants at every width <= original, plus blur + dominant color", async () => {
    const buffer = await jpeg(640, 480);
    const key = "media/test/original-640.jpg";
    await storagePut(key, buffer, "image/jpeg");
    const media = await createMedia({
      storageKey: key,
      originalName: "test-photo-640.jpg",
      bytes: buffer.length,
    });

    await mediaOptimizeHandler(fakeJob(media.id));

    const after = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(after.status).toBe("READY");
    expect(after.processingError).toBeNull();
    expect(after.width).toBe(640);
    expect(after.height).toBe(480);
    expect(after.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(after.dominantColor).toMatch(/^#[0-9a-f]{6}$/);

    const variants = after.variants as Record<
      string,
      Record<string, { key: string }>
    >;
    expect(Object.keys(variants).sort()).toEqual(["avif", "webp"]);
    // Original is 640px wide: only 320 and 640 qualify, never upscaled to
    // 960/1280/1920.
    expect(Object.keys(variants.webp).sort()).toEqual(["320", "640"]);
    expect(Object.keys(variants.avif).sort()).toEqual(["320", "640"]);
  });

  it("uses the original width as the sole variant when narrower than the smallest configured width", async () => {
    const buffer = await jpeg(100, 100);
    const key = "media/test/original-100.jpg";
    await storagePut(key, buffer, "image/jpeg");
    const media = await createMedia({
      storageKey: key,
      originalName: "test-photo-100.jpg",
      bytes: buffer.length,
    });

    await mediaOptimizeHandler(fakeJob(media.id));

    const after = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    const variants = after.variants as Record<string, Record<string, unknown>>;
    expect(Object.keys(variants.webp)).toEqual(["100"]);
    expect(Object.keys(variants.avif)).toEqual(["100"]);
  });

  it("is idempotent: re-running overwrites the same variant keys instead of duplicating them", async () => {
    const buffer = await jpeg(320, 240);
    const key = "media/test/original-320.jpg";
    await storagePut(key, buffer, "image/jpeg");
    const media = await createMedia({
      storageKey: key,
      originalName: "test-photo-320.jpg",
      bytes: buffer.length,
    });

    await mediaOptimizeHandler(fakeJob(media.id));
    const first = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    const firstVariants = first.variants as Record<
      string,
      Record<string, { key: string }>
    >;

    await mediaOptimizeHandler(fakeJob(media.id));
    const second = await db.media.findUniqueOrThrow({
      where: { id: media.id },
    });
    const secondVariants = second.variants as Record<
      string,
      Record<string, { key: string }>
    >;

    expect(secondVariants.webp["320"].key).toBe(firstVariants.webp["320"].key);
    expect(Object.keys(secondVariants.webp)).toEqual(
      Object.keys(firstVariants.webp),
    );
  });

  it("keeps Media PROCESSING while attempts remain, and only flips to FAILED on the final attempt", async () => {
    const media = await createMedia({
      storageKey: "media/test/does-not-exist.jpg",
      originalName: "test-missing.jpg",
      bytes: 1,
    });

    await expect(mediaOptimizeHandler(fakeJob(media.id, 0))).rejects.toThrow(
      "original file missing from storage",
    );
    const midway = await db.media.findUniqueOrThrow({
      where: { id: media.id },
    });
    expect(midway.status).toBe("PROCESSING");
    expect(midway.processingError).toBe("original file missing from storage");

    await expect(
      mediaOptimizeHandler(fakeJob(media.id, MAX_JOB_ATTEMPTS - 1)),
    ).rejects.toThrow();
    const final = await db.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(final.status).toBe("FAILED");
  });
});
