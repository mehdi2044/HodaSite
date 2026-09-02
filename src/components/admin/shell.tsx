import Link from "next/link";
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin" dir="rtl">
      <aside className="sidebar">
        <strong>STYLE HUB</strong>
        <Link href="/admin">داشبورد</Link>
        <Link href="/admin/users">کاربران</Link>
        <Link href="/admin/settings/brand">برند</Link>
        <Link href="/admin/settings/theme">پوسته</Link>
        <Link href="/admin/design">طراحی</Link>
        <Link href="/admin/system/health">سلامت</Link>
      </aside>
      <main className="shell">{children}</main>
    </div>
  );
}
