import Link from "next/link";
import { signOut } from "@/modules/auth";
import { getTranslations } from "next-intl/server";

export async function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
}) {
  const t = await getTranslations("contentAdmin");
  const security = await getTranslations("security");
  const shipping = await getTranslations("shipping");
  const commerce = await getTranslations("commerce");
  return (
    <div className="admin" dir="rtl">
      <aside className="sidebar">
        <strong>STYLE HUB</strong>
        <Link href="/admin">داشبورد</Link>
        <Link href="/admin/users">کاربران</Link>
        <Link href="/admin/security">{security("title")}</Link>
        <Link href="/admin/security/roles">{security("roles")}</Link>
        <Link href="/admin/security/audit">{security("audit")}</Link>
        <Link href="/admin/markets">بازارها</Link>
        <Link href="/admin/media">رسانه‌ها</Link>
        <Link href="/admin/catalog/products">محصولات</Link>
        <Link href="/admin/catalog/taxonomy">طبقه‌بندی کاتالوگ</Link>
        <Link href="/admin/pricing/fx">{t("pricingFx")}</Link>
        <Link href="/admin/pricing/fees">{t("feeRules")}</Link>
        <Link href="/admin/pricing/fees/simulator">{t("feeSimulator")}</Link>
        <Link href="/admin/orders">{commerce("orders")}</Link>
        <Link href="/admin/payments/banks">{commerce("bankAccounts")}</Link>
        <Link href="/admin/inventory">{t("inventoryLots")}</Link>
        <Link href="/admin/content/menus">{t("menus")}</Link>
        <Link href="/admin/content/pages">{t("pages")}</Link>
        <Link href="/admin/content/homepage">{t("homepage")}</Link>
        <Link href="/admin/content/translations">{t("translations")}</Link>
        <Link href="/admin/settings/brand">برند</Link>
        <Link href="/admin/settings/theme">پوسته</Link>
        <Link href="/admin/settings/contact">تماس</Link>
        <Link href="/admin/settings/social">شبکه‌های اجتماعی</Link>
        <Link href="/admin/settings/legal">حقوقی</Link>
        <Link href="/admin/settings/shipping">{shipping("settings")}</Link>
        <Link href="/admin/settings/checkout">پرداخت</Link>
        <Link href="/admin/settings/maintenance">حالت تعمیرات</Link>
        <Link href="/admin/settings/notifications">{t("notifications")}</Link>
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
