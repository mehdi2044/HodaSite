import Link from "next/link";
import { signOut } from "@/modules/auth";

export function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  return (
    <div className="admin" dir="rtl">
      <aside className="sidebar">
        <strong>STYLE HUB</strong>
        <Link href="/admin">داشبورد</Link>
        <Link href="/admin/users">کاربران</Link>
        <Link href="/admin/markets">بازارها</Link>
        <Link href="/admin/settings/brand">برند</Link>
        <Link href="/admin/settings/theme">پوسته</Link>
        <Link href="/admin/settings/contact">تماس</Link>
        <Link href="/admin/settings/social">شبکه‌های اجتماعی</Link>
        <Link href="/admin/settings/legal">حقوقی</Link>
        <Link href="/admin/settings/checkout">پرداخت</Link>
        <Link href="/admin/settings/maintenance">حالت تعمیرات</Link>
        <Link href="/admin/design">طراحی</Link>
        <Link href="/admin/system/health">سلامت</Link>
        <div className="sidebar-user">
          <span className="muted">{user.name}</span>
          <bdi dir="ltr">{user.email}</bdi>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button className="button" type="submit">
              خروج
            </button>
          </form>
        </div>
      </aside>
      <main className="shell">{children}</main>
    </div>
  );
}
