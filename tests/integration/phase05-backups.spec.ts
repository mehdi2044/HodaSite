import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId } } : null),
}));
import { db } from "@/lib/db";
import { seal } from "@/lib/secure-tokens";
import { totpFor } from "@/modules/auth/security";
import { backupAction } from "@/app/admin/(dashboard)/system/backups/actions";
import { beginUpload, appendUpload } from "@/modules/backups/uploads";
async function actor(roleKey: string) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  return db.user.create({
    data: {
      email: `backup-${randomUUID()}@example.com`,
      name: "Backup test",
      passwordHash: await bcrypt.hash("BackupTest123!", 4),
      mfaEnabled: true,
      mfaSecret: seal("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"),
      roles: { create: { roleId: role.id } },
    },
  });
}
afterEach(() => {
  state.userId = null;
});
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "backup authorization and quarantine",
  () => {
    it("denies forged operations for unprivileged roles and anonymous sessions", async () => {
      for (const role of [
        "warehouse",
        "accountant",
        "support",
        "data_entry",
        "marketing",
      ]) {
        const user = await actor(role);
        state.userId = user.id;
        for (const type of ["BACKUP", "VERIFY", "EXPORT"])
          await expect(
            backupAction(
              type === "BACKUP"
                ? { type, requestKey: randomUUID(), includeMedia: true }
                : { type, requestKey: randomUUID(), backupId: "unknown" },
            ),
          ).rejects.toThrow("FORBIDDEN");
        await expect(
          beginUpload(user.id, { name: "x.zip", bytes: 100 }),
        ).rejects.toThrow("FORBIDDEN");
      }
      state.userId = null;
      await expect(
        backupAction({
          type: "BACKUP",
          requestKey: randomUUID(),
          includeMedia: true,
        }),
      ).rejects.toThrow("UNAUTHENTICATED");
    });
    it("queues idempotently and consumes fresh TOTP without persisting credentials", async () => {
      const owner = await actor("owner");
      state.userId = owner.id;
      const request = {
        type: "BACKUP",
        requestKey: randomUUID(),
        includeMedia: true,
      };
      const first = await backupAction(request);
      expect(await backupAction(request)).toEqual(first);
      const backup = await db.backup.create({
        data: {
          kind: "manual",
          status: "DONE",
          fileKey: "2026-09-12_000001_test",
          sizeBytes: 1n,
        },
      });
      const restore = {
        type: "RESTORE",
        requestKey: randomUUID(),
        backupId: backup.id,
        mode: "FULL",
        password: "BackupTest123!",
        token: totpFor("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP").generate(),
        confirmed: true,
      };
      expect(
        (await backupAction({ ...restore, password: "WrongPassword" })).error,
      ).toBe("FAILED");
      const result = await backupAction(restore);
      expect(result.id).toBeTruthy();
      const task = await db.opsTask.findUniqueOrThrow({
        where: { id: result.id },
      });
      expect(task.authorizedAt).not.toBeNull();
      expect(JSON.stringify(task.payload)).not.toContain("BackupTest");
      expect(task.payload).not.toHaveProperty("token");
      await db.backup.update({
        where: { id: backup.id },
        data: { localPrunedAt: new Date() },
      });
      for (const type of ["VERIFY", "EXPORT", "RESTORE"])
        expect(
          (
            await backupAction({
              ...(type === "RESTORE" ? restore : { type, backupId: backup.id }),
              type,
              requestKey: randomUUID(),
            })
          ).error,
        ).toBe("FAILED");
      expect(
        (await db.backup.findUniqueOrThrow({ where: { id: backup.id } }))
          .status,
      ).toBe("DONE");
      expect(
        (await backupAction({ ...restore, requestKey: randomUUID() })).error,
      ).toBe("FAILED");
    });
    it("owns and bounds chunks, rejects wrong offsets and queues validation only after completion", async () => {
      const previous = process.env.BACKUP_UPLOAD_ROOT;
      const root = await mkdtemp(path.join(tmpdir(), "backup-chunks-"));
      process.env.BACKUP_UPLOAD_ROOT = root;
      try {
        const owner = await actor("owner"),
          other = await actor("owner");
        const row = await beginUpload(owner.id, {
          name: "../../metadata.zip",
          bytes: 6,
        });
        const body = (s: string) =>
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(Buffer.from(s));
              c.close();
            },
          });
        await expect(
          appendUpload(other.id, row.id, 0, body("abc")),
        ).rejects.toThrow("UPLOAD_UNAVAILABLE");
        expect(await appendUpload(owner.id, row.id, 0, body("abc"))).toEqual({
          received: 3,
          complete: false,
        });
        await expect(
          appendUpload(owner.id, row.id, 0, body("abc")),
        ).rejects.toThrow("UPLOAD_OFFSET");
        expect(await appendUpload(owner.id, row.id, 3, body("def"))).toEqual({
          received: 6,
          complete: true,
        });
        expect(await readFile(path.join(root, `${row.id}.zip`), "utf8")).toBe(
          "abcdef",
        );
        expect(
          await db.opsTask.count({
            where: { requestKey: `validate:${row.id}` },
          }),
        ).toBe(1);
      } finally {
        if (previous === undefined) delete process.env.BACKUP_UPLOAD_ROOT;
        else process.env.BACKUP_UPLOAD_ROOT = previous;
        await rm(root, { recursive: true, force: true });
      }
    });
  },
);
