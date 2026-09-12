import Link from "next/link";
import { visibleFinanceMarkets } from "@/modules/finance";
import { signOut } from "@/modules/auth";
import { getTranslations, getLocale } from "next-intl/server";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/modules/settings";
import { normalizeBrand } from "@/lib/brand";
import { AdminLocaleSwitcher } from "./locale-switcher";

export async function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { id: string; name: string; email: string };
}) {
  const t = await getTranslations("contentAdmin");
  const nav = await getTranslations("adminShell");
  const locale = await getLocale();
  const brand = normalizeBrand((await getSiteSettings())?.brand);
  const backups = await getTranslations("backups");
  const security = await getTranslations("security");
  const returns = await getTranslations("returns");
  const shipping = await getTranslations("shipping");
  const commerce = await getTranslations("commerce");
  const health = await getTranslations("healthAdmin");
  const finance = await getTranslations("finance");
  const financeMarkets = await visibleFinanceMarkets(user.id);
  const showHealth = await can(user.id, "system.health.view");
  const alertCount = showHealth
    ? await db.systemAlert.count({ where: { resolvedAt: null } })
    : 0;
  return (
    <div className="admin" dir={locale === "fa" ? "rtl" : "ltr"}>
      <aside className="sidebar">
        <strong>{brand.name[locale] ?? brand.name.fa}</strong>
        <AdminLocaleSwitcher />
        <Link href="/admin">{nav("dashboard")}</Link>
        <Link href="/admin/users">{nav("users")}</Link>
        <Link href="/admin/security">{security("title")}</Link>
        <Link href="/admin/security/roles">{security("roles")}</Link>
        <Link href="/admin/security/audit">{security("audit")}</Link>
        <Link href="/admin/markets">{nav("markets")}</Link>
        <Link href="/admin/media">{nav("media")}</Link>
        <Link href="/admin/catalog/products">{nav("products")}</Link>
        <Link href="/admin/catalog/taxonomy">{nav("taxonomy")}</Link>
        <Link href="/admin/pricing/fx">{t("pricingFx")}</Link>
        <Link href="/admin/pricing/fees">{t("feeRules")}</Link>
        <Link href="/admin/pricing/fees/simulator">{t("feeSimulator")}</Link>
        <Link href="/admin/orders">{commerce("orders")}</Link>
        {financeMarkets.length > 0 && (
          <Link href="/admin/finance">{finance("title")}</Link>
        )}
        <Link href="/admin/returns">{returns("title")}</Link>
        <Link href="/admin/payments/banks">{commerce("bankAccounts")}</Link>
        <Link href="/admin/inventory">{t("inventoryLots")}</Link>
        <Link href="/admin/content/menus">{t("menus")}</Link>
        <Link href="/admin/content/pages">{t("pages")}</Link>
        <Link href="/admin/content/homepage">{t("homepage")}</Link>
        <Link href="/admin/content/translations">{t("translations")}</Link>
        <Link href="/admin/settings/brand">{nav("brand")}</Link>
        <Link href="/admin/settings/theme">{nav("theme")}</Link>
        <Link href="/admin/settings/contact">{nav("contact")}</Link>
        <Link href="/admin/settings/social">{nav("social")}</Link>
        <Link href="/admin/settings/legal">{nav("legal")}</Link>
        <Link href="/admin/settings/shipping">{shipping("settings")}</Link>
        <Link href="/admin/settings/checkout">{nav("checkout")}</Link>
        <Link href="/admin/settings/maintenance">{nav("maintenance")}</Link>
        <Link href="/admin/settings/notifications">{t("notifications")}</Link>
        <Link href="/admin/design">{nav("design")}</Link>
        <Link href="/admin/system/backups">{backups("title")}</Link>
        <Link href="/admin/system/health">{nav("health")}</Link>
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
              {nav("signOut")}
            </button>
          </form>
        </div>
      </aside>
      <main className="shell min-w-0">
        {showHealth && (
          <div className="mb-5 flex justify-end">
            <Link
              className="button inline-flex items-center gap-2 min-h-11"
              href="/admin/system/health"
              aria-label={health("alertCount", { count: alertCount })}
            >
              {health("alerts")} <span aria-hidden="true">{alertCount}</span>
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
