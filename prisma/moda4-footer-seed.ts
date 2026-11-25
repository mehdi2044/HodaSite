import type { Prisma, PrismaClient } from "@prisma/client";

type Labels = Record<"fa" | "tr" | "en", string>;
type Destination = { url: string } | { referenceId: string };
type FooterLink = { key: string; label: Labels } & Destination;

const groups = [
  {
    key: "shop",
    label: { fa: "فروشگاه", tr: "Mağaza", en: "Shop" },
    url: "/search",
    links: [
      {
        key: "women",
        label: { fa: "زنانه", tr: "Kadın", en: "Women" },
        referenceId: "seed-category-women",
      },
      {
        key: "men",
        label: { fa: "مردانه", tr: "Erkek", en: "Men" },
        referenceId: "seed-category-men",
      },
      {
        key: "kids",
        label: { fa: "کودکان", tr: "Çocuk", en: "Kids" },
        referenceId: "seed-category-kids",
      },
      {
        key: "accessories",
        label: { fa: "اکسسوری", tr: "Aksesuar", en: "Accessories" },
        referenceId: "seed-category-accessories",
      },
    ],
  },
  {
    key: "experience",
    label: { fa: "تجربه", tr: "Deneyim", en: "Experience" },
    url: "/fitting-room",
    links: [
      {
        key: "fitting",
        label: { fa: "اتاق پرو", tr: "Deneme odası", en: "Fitting room" },
        url: "/fitting-room",
      },
      {
        key: "lookbook",
        label: { fa: "دفتر استایل", tr: "Stil günlüğü", en: "Lookbook" },
        url: "/#lookbook",
      },
    ],
  },
  {
    key: "help",
    label: { fa: "راهنما", tr: "Yardım", en: "Help" },
    pageId: "seed-page-faq",
    links: [
      {
        key: "orders",
        label: { fa: "سفارش‌های من", tr: "Siparişlerim", en: "My orders" },
        url: "/account#orders",
      },
    ],
  },
  {
    key: "account",
    label: { fa: "حساب", tr: "Hesap", en: "Account" },
    url: "/account",
    links: [
      {
        key: "login",
        label: {
          fa: "ورود / ثبت‌نام",
          tr: "Giriş / Kayıt",
          en: "Sign in / Register",
        },
        url: "/account/login",
      },
      {
        key: "profile",
        label: { fa: "حساب من", tr: "Hesabım", en: "My account" },
        url: "/account",
      },
      {
        key: "wishlist",
        label: { fa: "علاقه‌مندی‌ها", tr: "Favoriler", en: "Wishlist" },
        url: "/account/wishlist",
      },
    ],
  },
] satisfies {
  key: string;
  label: Labels;
  url?: string;
  pageId?: string;
  links: FooterLink[];
}[];

/** Only called for a new demo store. The menu editor owns persisted changes. */
export async function seedModa4Footer(db: PrismaClient, menuId: string) {
  const children: Prisma.MenuItemCreateManyInput[] = [];
  const parents = groups.map((group, sortOrder) => {
    const id = `seed-moda4-footer-${group.key}`;
    group.links.forEach((link: FooterLink, index) => {
      children.push({
        id: `${id}-${link.key}`,
        menuId,
        parentId: id,
        labelI18n: link.label,
        sortOrder: index,
        ...("url" in link
          ? { linkType: "url", url: link.url }
          : { linkType: "category", referenceId: link.referenceId }),
      });
    });
    return {
      id,
      menuId,
      labelI18n: group.label,
      sortOrder,
      ...("pageId" in group
        ? { linkType: "page", pageId: group.pageId }
        : { linkType: "url", url: group.url }),
    };
  });
  await db.$transaction([
    db.menuItem.createMany({ data: parents }),
    db.menuItem.createMany({ data: children }),
  ]);
}
