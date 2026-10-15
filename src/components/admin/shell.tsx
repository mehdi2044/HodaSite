import Link from "next/link";
import { AdminNavigation } from "./navigation";
import type { AdminNavGroup } from "@/lib/admin-navigation";
import { visibleCrmMarkets } from "@/modules/crm";
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
  const ai = await getTranslations("aiAdmin");
  const journal = await getTranslations("journal");
  const launch = await getTranslations("launch");
  const engagement = await getTranslations("engagement");
  const seo = await getTranslations("seoAdmin");
  const crm = await getTranslations("crm");
  const promotions = await getTranslations("promotionAdmin");
  const promotionMarkets = await visibleCrmMarkets("pricing.sale_price.edit");
  const crmVisible = (
    await Promise.all(
      [
        "crm.customer.view",
        "crm.segment.manage",
        "crm.privacy.review",
        "crm.metrics.manage",
      ].map((p) => visibleCrmMarkets(p)),
    )
  ).some((m) => m.length);
  const financeMarkets = await visibleFinanceMarkets(user.id);
  const showHealth = await can(user.id, "system.health.view");
  const alertCount = showHealth
    ? await db.systemAlert.count({ where: { resolvedAt: null } })
    : 0;
  const [
    canModerate,
    canAiSettings,
    canGenerate,
    canUsage,
    canAnalyze,
    canSeo,
  ] = await Promise.all(
    [
      "content.page.publish",
      "ai.settings.manage",
      "ai.product.generate",
      "ai.usage.view",
      "ai.finance.analyze",
      "settings.brand.edit",
    ].map((permission) => can(user.id, permission)),
  );
  const fitting = await getTranslations("fitting");
  const link = (href: string, label: string) => ({ href, label });
  const groups: AdminNavGroup[] = [
    { title: nav("groupOverview"), links: [link("/admin", nav("dashboard"))] },
    {
      title: nav("groupCommerce"),
      links: [
        link("/admin/orders", commerce("orders")),
        link("/admin/returns", returns("title")),
        link("/admin/payments/banks", commerce("bankAccounts")),
        ...(promotionMarkets.length
          ? [link("/admin/promotions", promotions("title"))]
          : []),
        ...(crmVisible ? [link("/admin/crm", crm("title"))] : []),
      ],
    },
    {
      title: nav("groupCatalog"),
      links: [
        link("/admin/catalog/products", nav("products")),
        link("/admin/catalog/taxonomy", nav("taxonomy")),
        link("/admin/inventory", t("inventoryLots")),
        link("/admin/media", nav("media")),
      ],
    },
    {
      title: nav("groupContent"),
      links: [
        link("/admin/content/homepage", t("homepage")),
        link("/admin/content/menus", t("menus")),
        link("/admin/content/pages", t("pages")),
        link("/admin/content/translations", t("translations")),
        ...(canModerate
          ? [link("/admin/content/reviews", engagement("moderation"))]
          : []),
        link("/admin/design", nav("design")),
      ],
    },
    {
      title: nav("groupFinance"),
      links: [
        link("/admin/pricing/fx", t("pricingFx")),
        link("/admin/pricing/fees", t("feeRules")),
        link("/admin/pricing/fees/simulator", t("feeSimulator")),
        ...(financeMarkets.length
          ? [
              link("/admin/finance", finance("title")),
              link("/admin/finance/journal", journal("title")),
            ]
          : []),
        ...(canAnalyze ? [link("/admin/finance/analyst", ai("analyst"))] : []),
      ],
    },
    {
      title: nav("groupSettings"),
      links: [
        link("/admin/markets", nav("markets")),
        link("/admin/settings/brand", nav("brand")),
        link("/admin/settings/theme", nav("theme")),
        link("/admin/settings/contact", nav("contact")),
        link("/admin/settings/social", nav("social")),
        link("/admin/settings/legal", nav("legal")),
        link("/admin/settings/shipping", shipping("settings")),
        link("/admin/settings/checkout", nav("checkout")),
        link("/admin/settings/maintenance", nav("maintenance")),
        link("/admin/settings/notifications", t("notifications")),
        ...(canAiSettings
          ? [
              link("/admin/settings/ai", ai("settings")),
              link("/admin/settings/fitting", fitting("adminTitle")),
            ]
          : []),
        ...(canSeo ? [link("/admin/settings/seo", seo("title"))] : []),
      ],
    },
    {
      title: nav("groupSystem"),
      links: [
        link("/admin/users", nav("users")),
        link("/admin/security", security("title")),
        link("/admin/security/roles", security("roles")),
        link("/admin/security/audit", security("audit")),
        link("/admin/system/backups", backups("title")),
        link("/admin/system/health", nav("health")),
        ...(showHealth ? [link("/admin/system/launch", launch("title"))] : []),
        ...(canGenerate ? [link("/admin/ai/review", ai("queue"))] : []),
        ...(canUsage ? [link("/admin/ai/usage", ai("usage"))] : []),
      ],
    },
  ];
  return (
    <div className="admin" dir={locale === "fa" ? "rtl" : "ltr"}>
      <a className="admin-skip" href="#admin-content">
        {nav("skipContent")}
      </a>
      <aside className="sidebar">
        <div className="admin-brand">
          <strong>{brand.name[locale] ?? brand.name.fa}</strong>
          <span>{nav("dashboard")}</span>
        </div>
        <AdminLocaleSwitcher />
        <AdminNavigation
          groups={groups}
          labels={{
            navigation: nav("navigation"),
            search: nav("searchNavigation"),
            empty: nav("navigationEmpty"),
            menu: nav("menu"),
          }}
        />
      </aside>
      <main
        id="admin-content"
        className="shell admin-workspace min-w-0"
        tabIndex={-1}
      >
        <header className="admin-topbar">
          <div className="admin-user">
            <span>{user.name}</span>
            <bdi dir="ltr">{user.email}</bdi>
          </div>
          <div className="admin-topbar-actions">
            {showHealth && (
              <Link
                className="button"
                href="/admin/system/health"
                aria-label={health("alertCount", { count: alertCount })}
              >
                {health("alerts")}{" "}
                <span aria-hidden="true">
                  {new Intl.NumberFormat(locale).format(alertCount)}
                </span>
              </Link>
            )}
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
        </header>
        {children}
      </main>
    </div>
  );
}
