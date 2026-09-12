import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { assertBackupOwner } from "./service";
import { CHUNK_BYTES, uploadInitSchema } from "./validation";
export const uploadRoot = () =>
  process.env.BACKUP_UPLOAD_ROOT ?? "/backup-uploads";
export async function beginUpload(userId: string, raw: unknown) {
  await assertBackupOwner(userId, "backup.upload");
  const input = uploadInitSchema.parse(raw);
  const max = Number(process.env.BACKUP_UPLOAD_MAX_BYTES ?? 50 * 1024 ** 3);
  if (!Number.isSafeInteger(max) || input.bytes > max)
    throw new Error("UPLOAD_SIZE");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const active = await tx.backupUpload.count({
        where: { ownerId: userId, expiresAt: { gt: new Date() } },
      });
      if (active >= 2) throw new Error("UPLOAD_LIMIT");
      return tx.backupUpload.create({
        data: {
          ownerId: userId,
          originalName: input.name,
          expectedBytes: BigInt(input.bytes),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    }),
  );
}
export async function appendUpload(
  userId: string,
  id: string,
  offset: number,
  body: ReadableStream<Uint8Array> | null,
) {
  await assertBackupOwner(userId, "backup.upload");
  z.uuid().parse(id);
  z.number().int().nonnegative().safe().parse(offset);
  if (!body) throw new Error("UPLOAD_EMPTY");
  const owned = await db.backupUpload.findFirst({
    where: {
      id,
      ownerId: userId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
  });
  if (!owned) throw new Error("UPLOAD_UNAVAILABLE");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > CHUNK_BYTES) throw new Error("UPLOAD_SIZE");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  if (!bytes) throw new Error("UPLOAD_EMPTY");
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "BackupUpload" WHERE id=${id} AND "ownerId"=${userId} FOR UPDATE`;
        const row = await tx.backupUpload.findFirst({
          where: {
            id,
            ownerId: userId,
            status: "OPEN",
            expiresAt: { gt: new Date() },
          },
        });
        if (
          !row ||
          row.receivedBytes !== BigInt(offset) ||
          row.receivedBytes + BigInt(bytes) > row.expectedBytes
        )
          throw new Error("UPLOAD_OFFSET");
        await mkdir(uploadRoot(), { recursive: true, mode: 0o700 });
        const handle = await open(
          path.join(uploadRoot(), `${id}.zip`),
          offset === 0 ? "w" : "r+",
        );
        try {
          // Truncate bytes from any previous file write whose DB transaction failed.
          await handle.truncate(offset);
          const buffer = Buffer.concat(chunks);
          let written = 0;
          while (written < buffer.length) {
            const result = await handle.write(
              buffer,
              written,
              buffer.length - written,
              offset + written,
            );
            if (!result.bytesWritten) throw new Error("UPLOAD_WRITE");
            written += result.bytesWritten;
          }
          await handle.sync();
        } finally {
          await handle.close();
        }
        const total = row.receivedBytes + BigInt(bytes);
        const complete = total === row.expectedBytes;
        await tx.backupUpload.update({
          where: { id },
          data: {
            receivedBytes: total,
            status: complete ? "UPLOADED" : "OPEN",
          },
        });
        if (complete) {
          await tx.opsTask.create({
            data: {
              requestKey: `validate:${id}`,
              type: "VALIDATE_UPLOAD",
              requestedBy: userId,
              payload: { uploadId: id },
            },
          });
          await tx.auditLog.create({
            data: {
              userId,
              action: "backup.upload",
              entityType: "BackupUpload",
              entityId: id,
              after: { bytes: total.toString() },
            },
          });
        }
        return { received: Number(total), complete };
      },
      { timeout: 30000 },
    ),
  );
}
