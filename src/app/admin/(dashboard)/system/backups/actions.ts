"use server";
import { auth } from "@/modules/auth";
import { UnauthorizedError, ForbiddenError, assertCan } from "@/modules/access";
import {
  queueBackupOperation,
  saveBackupSettings,
} from "@/modules/backups/service";
import { backupOperationSchema } from "@/modules/backups/validation";
import { revalidatePath } from "next/cache";
export async function backupAction(raw: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  try {
    const input = backupOperationSchema.parse(raw);
    await assertCan(
      session.user.id,
      input.type === "BACKUP"
        ? "backup.create"
        : input.type === "RESTORE"
          ? "backup.restore"
          : "backup.view",
    );
    const id = await queueBackupOperation(session.user.id, input);
    revalidatePath("/admin/system/backups");
    return { id };
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    return { error: "FAILED" };
  }
}
export async function backupSettingsAction(raw: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  try {
    await assertCan(session.user.id, "backup.create");
    await saveBackupSettings(session.user.id, raw);
    revalidatePath("/admin/system/backups");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    return { error: "FAILED" };
  }
}
