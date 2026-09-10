import { redirect } from "next/navigation";
import { getAdminSession } from "@/modules/auth";
import { MfaSetup } from "@/components/admin/security/setup";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function SetupPage() {
  const session = await getAdminSession(true);
  if (!session) redirect("/admin/login");
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  if (user.mfaEnabled) redirect("/admin/security");
  return <MfaSetup />;
}
