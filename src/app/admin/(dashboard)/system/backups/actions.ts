"use server";
import { auth } from "@/modules/auth";
import { UnauthorizedError, ForbiddenError } from "@/modules/access";
import {
  queueBackupOperation,
  saveBackupSettings,
} from "@/modules/backups/service";
import { revalidatePath } from "next/cache";
export async function backupAction(raw: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  try {
    const id = await queueBackupOperation(session.user.id, raw);
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
    await saveBackupSettings(session.user.id, raw);
    revalidatePath("/admin/system/backups");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    return { error: "FAILED" };
  }
}
