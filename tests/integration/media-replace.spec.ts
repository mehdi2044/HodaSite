import { afterEach, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { MAX_JOB_ATTEMPTS } from "@/modules/jobs";
import type { StorageProvider } from "@/modules/integrations/storage";
import { mediaReplaceHandler } from "@/modules/media/replace";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

class MemoryStorage implements StorageProvider {
  objects = new Map<string, Buffer>();
  failDeleteOnce = new Set<string>();
  async put(key: string, data: Buffer) {
    this.objects.set(key, data);
    return `/media/${key}`;
  }
  async getSignedUrl(key: string) {
    return `/media/${key}`;
  }
  async getBytes(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    if (this.failDeleteOnce.delete(key)) throw new Error("cleanup unavailable");
    this.objects.delete(key);
  }
}

describe.skipIf(!hasDb)("atomic media replacement", () => {
  const target = new MemoryStorage();
  const userId = "test-media-replace-user";
  beforeAll(async () => {
    await db.user.upsert({
      where: { email: "media-replace-test@example.com" },
      update: {},
      create: {
        id: userId,
        email: "media-replace-test@example.com",
        passwordHash: "test",
        name: "Test",
      },
    });
  });
  afterEach(async () => {
    // AuditLog is intentionally append-only (D24), including in tests.
    // MediaReplacement cascades from Media, while audit rows remain as the
    // immutable record of the completed operation.
    await db.media.deleteMany({ where: { uploadedBy: userId } });
    target.objects.clear();
    target.failDeleteOnce.clear();
  });

  async function jpeg(color: string, orientation = 1) {
    return sharp({
      create: { width: 640, height: 480, channels: 3, background: color },
    })
      .withMetadata({ orientation })
      .jpeg()
      .toBuffer();
  }
  async function fixture(
    baseStorageKey = "media/test/old.jpg",
    orientation = 1,
  ) {
    const oldBytes = await jpeg("#111111");
    const newBytes = await jpeg("#e8792a", orientation);
    target.objects.set(baseStorageKey, oldBytes);
    target.objects.set("media/test/new.jpg", newBytes);
    const media = await db.media.create({
      data: {
        kind: "image",
        storageKey: baseStorageKey,
        originalName: "old.jpg",
        url: `/media/${baseStorageKey}`,
        bytes: oldBytes.length,
        mime: "image/jpeg",
        status: "READY",
        uploadedBy: userId,
        altI18n: { fa: "ثابت" },
        tags: ["keep"],
      },
    });
    const replacement = await db.mediaReplacement.create({
      data: {
        mediaId: media.id,
        baseStorageKey,
        storageKey: "media/test/new.jpg",
        url: "/media/media/test/new.jpg",
        originalName: "new.jpg",
        bytes: newBytes.length,
        mime: "image/jpeg",
        requestedBy: userId,
      },
    });
    return { media, replacement };
  }
  function job(replacementId: string, attempts = 0) {
    return {
      id: "replace-job",
      type: "media-replace",
      payload: { replacementId },
      attempts,
    };
  }

  it("keeps the Media id and metadata, swaps only after processing, and removes old objects", async () => {
    const { media, replacement } = await fixture();
    await mediaReplaceHandler(job(replacement.id), target);
    const updated = await db.media.findUniqueOrThrow({
      where: { id: media.id },
    });
    expect(updated.id).toBe(media.id);
    expect(updated.storageKey).toBe("media/test/new.jpg");
    expect(updated.altI18n).toEqual({ fa: "ثابت" });
    expect(updated.tags).toEqual(["keep"]);
    expect(target.objects.has("media/test/old.jpg")).toBe(false);
    expect(
      (
        await db.mediaReplacement.findUniqueOrThrow({
          where: { id: replacement.id },
        })
      ).status,
    ).toBe("DONE");
  });

  it.each([1, 3, 6, 8])(
    "replacement uses corrected metadata for EXIF %s",
    async (orientation) => {
      const { media, replacement } = await fixture(undefined, orientation);
      await mediaReplaceHandler(job(replacement.id), target);
      const updated = await db.media.findUniqueOrThrow({
        where: { id: media.id },
      });
      const record = await db.mediaReplacement.findUniqueOrThrow({
        where: { id: replacement.id },
      });
      expect([updated.width, updated.height]).toEqual(
        orientation >= 6 ? [480, 640] : [640, 480],
      );
      expect([record.width, record.height]).toEqual([
        updated.width,
        updated.height,
      ]);
      for (const byWidth of Object.values(
        updated.variants as Record<
          string,
          Record<string, { key: string; width: number; height: number }>
        >,
      )) {
        for (const [descriptor, item] of Object.entries(byWidth)) {
          const actual = await sharp(target.objects.get(item.key)!).metadata();
          expect(actual.width).toBe(Number(descriptor));
          expect([actual.width, actual.height]).toEqual([
            item.width,
            item.height,
          ]);
        }
      }
    },
  );

  it("does not swap when the live media changed and leaves the replacement retryable/finally failed", async () => {
    const { media, replacement } = await fixture();
    await db.media.update({
      where: { id: media.id },
      data: {
        storageKey: "media/test/other.jpg",
        url: "/media/media/test/other.jpg",
      },
    });
    await expect(
      mediaReplaceHandler(job(replacement.id, MAX_JOB_ATTEMPTS - 1), target),
    ).rejects.toThrow("stale");
    expect(
      (await db.media.findUniqueOrThrow({ where: { id: media.id } }))
        .storageKey,
    ).toBe("media/test/other.jpg");
    expect(
      (
        await db.mediaReplacement.findUniqueOrThrow({
          where: { id: replacement.id },
        })
      ).status,
    ).toBe("FAILED");
  });

  it("retries cleanup without a second swap", async () => {
    const { media, replacement } = await fixture();
    target.failDeleteOnce.add(media.storageKey);
    await expect(
      mediaReplaceHandler(job(replacement.id), target),
    ).rejects.toThrow("cleanup unavailable");
    expect(
      (
        await db.mediaReplacement.findUniqueOrThrow({
          where: { id: replacement.id },
        })
      ).status,
    ).toBe("SWAPPED");
    await mediaReplaceHandler(job(replacement.id, 1), target);
    expect(
      (
        await db.mediaReplacement.findUniqueOrThrow({
          where: { id: replacement.id },
        })
      ).status,
    ).toBe("DONE");
  });
});
