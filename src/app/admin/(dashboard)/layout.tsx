import { redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { AdminShell } from "@/components/admin/shell";

// Defence in depth: middleware already redirects unauthenticated requests to
// /admin/login, but every protected admin page also re-checks the session on
// the server here. /admin/login sits outside this route group, so there is no
// redirect loop.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  return (
    <AdminShell
      user={{
        name: session.user.name ?? session.user.email ?? "",
        email: session.user.email ?? "",
      }}
    >
      {children}
    </AdminShell>
  );
}
