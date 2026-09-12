import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { signValue } from "@/lib/secure-tokens";
import { assertCan, ForbiddenError, scopeMatches } from "@/modules/access";
import { requireFreshMfa } from "@/modules/auth/security";
import {
  backupOperationSchema,
  backupSettingsSchema,
  backupKey,
} from "./validation";
export async function assertBackupOwner(
  userId: string,
  permission = "backup.restore",
) {
  await assertCan(userId, permission);
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (
    !user?.isActive ||
    !user.mfaEnabled ||
    !user.roles.some(
      (r) => r.role.key === "owner" && scopeMatches(r.scope, undefined),
    )
  )
    throw new ForbiddenError(permission);
}
export async function queueBackupOperation(userId: string, raw: unknown) {
  const input = backupOperationSchema.parse(raw);
  const permission =
    input.type === "BACKUP"
      ? "backup.create"
      : input.type === "RESTORE"
        ? "backup.restore"
        : "backup.view";
  await assertCan(userId, permission);
  if (input.type === "RESTORE") await assertBackupOwner(userId);
  return withMutation(async () => {
    const existing = await db.opsTask.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (existing) {
      if (existing.requestedBy !== userId || existing.type !== input.type)
        throw new ForbiddenError(permission);
      return existing.id;
    }
    const payload: Record<string, string | boolean> = {};
    if ("backupId" in input && input.backupId) {
      const backup = await db.backup.findFirst({
        where: { id: input.backupId, status: "DONE" },
      });
      if (!backup) throw new Error("BACKUP_UNAVAILABLE");
      payload.backupId = backup.id;
      payload.fileKey = backupKey.parse(backup.fileKey);
      if (
        input.type === "RESTORE" &&
        input.mode !== "DB_ONLY" &&
        !backup.mediaIncluded
      )
        throw new Error("BACKUP_NO_MEDIA");
    }
    if (input.type === "BACKUP") payload.includeMedia = input.includeMedia;
    if (input.type === "RESTORE") {
      if (input.uploadId) {
        const upload = await db.backupUpload.findFirst({
          where: {
            id: input.uploadId,
            ownerId: userId,
            status: "READY",
            expiresAt: { gt: new Date() },
          },
        });
        if (!upload) throw new Error("BACKUP_UNAVAILABLE");
        payload.uploadId = upload.id;
      }
      payload.mode = input.mode;
      await requireFreshMfa(userId, input.password, input.token);
    }
    return db.$transaction(async (tx) => {
      await assertCan(userId, permission);
      const task = await tx.opsTask.create({
        data: {
          requestKey: input.requestKey,
          type: input.type,
          requestedBy: userId,
          authorizedAt: input.type === "RESTORE" ? new Date() : null,
          payload,
        },
      });
      if (input.type === "RESTORE")
        await tx.restoreRequest.create({
          data: {
            id: task.id,
            backupId: input.backupId,
            uploadedFileKey: input.uploadId ? `${input.uploadId}.zip` : null,
            mode: input.mode,
            requestedBy: userId,
            mfaVerifiedAt: task.authorizedAt,
          },
        });
      await tx.auditLog.create({
        data: {
          userId,
          action: `backup.${input.type.toLowerCase()}.requested`,
          entityType: "OpsTask",
          entityId: task.id,
          after: payload,
        },
      });
      return task.id;
    });
  });
}
export async function saveBackupSettings(userId: string, raw: unknown) {
  await assertBackupOwner(userId, "backup.create");
  const data = backupSettingsSchema.parse(raw);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      const before = await tx.backupSettings.findUnique({
        where: { id: "default" },
      });
      await tx.backupSettings.upsert({
        where: { id: "default" },
        create: data,
        update: data,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "backup.settings",
          entityType: "BackupSettings",
          entityId: "default",
          before: before ? JSON.parse(JSON.stringify(before)) : {},
          after: data,
        },
      });
    }),
  );
}
export function downloadLink(userId: string, fileKey: string) {
  backupKey.parse(fileKey);
  const expires = Date.now() + 300000;
  const signature = signValue(
    `backup-download:${userId}:${fileKey}:${expires}`,
  );
  return `/api/admin/backups/download?key=${encodeURIComponent(fileKey)}&expires=${expires}&signature=${signature}`;
}
export { randomUUID };
