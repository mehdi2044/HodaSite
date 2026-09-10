import { redirect, notFound } from "next/navigation";
import { auth } from "./index";
import { assertCan, ForbiddenError } from "@/modules/access";
/** Read-page policy: unauthenticated -> login; unauthorized -> 404 before any
 * target lookup, including an unknown target. Mutation guards retain typed
 * ForbiddenError; JSON endpoints retain 401/403. */
export async function requireAdminPage(permission: string) {
  const session = await auth();
  if (!session) redirect("/admin/login");
  try {
    await assertCan(session.user.id, permission);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  return session.user.id;
}
