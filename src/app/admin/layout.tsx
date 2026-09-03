// Bare wrapper shared by the login page and the protected dashboard. No auth
// logic here on purpose — the session guard lives in (dashboard)/layout.tsx so
// that /admin/login (outside that route group) never hits a redirect loop.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div dir="rtl">{children}</div>;
}
