import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { setMaintenanceFlag } from "@/modules/settings";
import { MEDIA_PURGE_JOB } from "@/modules/media/constants";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!hasDb)("media-purge job", () => {
  let tmpDir: string;
  let mediaPurgeHandler: typeof import("@/modules/media/purge").mediaPurgeHandler;
  let storagePut: typeof import("@/modules/integrations/storage").storage.put;
  let storageGetBytes: typeof import("@/modules/integrations/storage").storage.getBytes;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hoda-media-purge-test-"));
    process.env.MEDIA_DIR = tmpDir;
    process.env.STORAGE_PROVIDER = "local";
    const storageModule = await import("@/modules/integrations/storage");
    storagePut = storageModule.storage.put.bind(storageModule.storage);
    storageGetBytes = storageModule.storage.getBytes.bind(
      storageModule.storage,
    );
    ({ mediaPurgeHandler } = await import("@/modules/media/purge"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    setMaintenanceFlag(false);
    await db.media.deleteMany({
      where: { originalName: { startsWith: "test-" } },
    });
    await db.job.deleteMany({ where: { type: MEDIA_PURGE_JOB } });
  });

  async function createSoftDeleted(opts: {
    daysAgo: number;
    storageKey: string;
    variants?: object;
  }) {
    await storagePut(opts.storageKey, Buffer.from("x"), "image/jpeg");
    return db.media.create({
      data: {
        kind: "image",
        storageKey: opts.storageKey,
        originalName: `test-${opts.storageKey}`,
        url: `/media/${opts.storageKey}`,
        bytes: 1,
        mime: "image/jpeg",
        status: "READY",
        variants: opts.variants ?? {},
        deletedAt: new Date(Date.now() - opts.daysAgo * DAY_MS),
      },
    });
  }

  it("purges files + DB row past the default 30-day retention, leaves recent soft-deletes alone", async () => {
    const variantKey = "media/test/old-variant-320.webp";
    await storagePut(variantKey, Buffer.from("v"), "image/webp");
    const old = await createSoftDeleted({
      daysAgo: 31,
      storageKey: "media/test/old-original.jpg",
      variants: {
        webp: {
          "320": { key: variantKey, url: `/media/${variantKey}`, bytes: 1 },
        },
      },
    });
    const recent = await createSoftDeleted({
      daysAgo: 1,
      storageKey: "media/test/recent-original.jpg",
    });

    await mediaPurgeHandler();

    await expect(
      db.media.findUnique({ where: { id: old.id } }),
    ).resolves.toBeNull();
    await expect(
      storageGetBytes("media/test/old-original.jpg"),
    ).resolves.toBeNull();
    await expect(storageGetBytes(variantKey)).resolves.toBeNull();

    const stillThere = await db.media.findUnique({ where: { id: recent.id } });
    expect(stillThere).not.toBeNull();
  });

  it("never purges while maintenance is on, and reschedules the next sweep", async () => {
    const old = await createSoftDeleted({
      daysAgo: 31,
      storageKey: "media/test/maintenance-original.jpg",
    });
    setMaintenanceFlag(true);

    await expect(mediaPurgeHandler()).rejects.toThrow("maintenance is on");

    const stillThere = await db.media.findUnique({ where: { id: old.id } });
    expect(stillThere).not.toBeNull();

    const nextSweep = await db.job.findFirst({
      where: { type: MEDIA_PURGE_JOB },
    });
    expect(nextSweep).not.toBeNull();
    expect(nextSweep!.runAt.getTime()).toBeGreaterThan(Date.now());
  });
});
