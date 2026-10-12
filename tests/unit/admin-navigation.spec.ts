import { describe, expect, it } from "vitest";
import {
  activeAdminHref,
  filterAdminNavigation,
  type AdminNavGroup,
} from "@/lib/admin-navigation";

const groups: AdminNavGroup[] = [
  { title: "نمای کلی", links: [{ href: "/admin", label: "داشبورد" }] },
  {
    title: "مالی",
    links: [
      { href: "/admin/finance", label: "گزارش‌ها" },
      { href: "/admin/finance/journal", label: "دفتر روزنامه" },
    ],
  },
  {
    title: "کالا",
    links: [{ href: "/admin/catalog/products", label: "کالاهای کودک" }],
  },
];
describe("admin navigation presentation", () => {
  it("marks only the most specific destination on detail routes", () => {
    expect(activeAdminHref("/admin/finance/journal/entry-id", groups)).toBe(
      "/admin/finance/journal",
    );
    expect(activeAdminHref("/admin", groups)).toBe("/admin");
    expect(activeAdminHref("/admin/finance-other", groups)).toBeUndefined();
    expect(activeAdminHref("/admin/unknown", groups)).toBeUndefined();
  });
  it("normalizes common Arabic keyboard forms without changing destinations", () => {
    const result = filterAdminNavigation(groups, "كودك", "fa");
    expect(result.flatMap((group) => group.links)).toEqual([
      groups[2].links[0],
    ]);
  });
  it("lets a group name find its links and preserves the supplied order", () => {
    expect(filterAdminNavigation(groups, "مالی", "fa")).toEqual([groups[1]]);
    expect(filterAdminNavigation(groups, "  ", "fa")).toEqual(groups);
  });
  it("does not manufacture a hidden or unauthorized destination", () => {
    expect(filterAdminNavigation(groups, "restore", "en")).toEqual([]);
    expect(activeAdminHref("/admin/system/backups", groups)).toBeUndefined();
  });
  it.each(["içerik", "İÇERİK", "tasarım"])(
    "uses the selected Turkish locale for group search: %s",
    (query) => {
      const turkish = [
        {
          title: "İçerik ve tasarım",
          links: [{ href: "/admin/content", label: "Ana sayfa" }],
        },
      ];
      expect(filterAdminNavigation(turkish, query, "tr")).toEqual(turkish);
    },
  );
  it("uses Turkish dotted and dotless I rules for individual links", () => {
    const turkish = [
      {
        title: "Mağaza",
        links: [
          { href: "/admin/returns", label: "İadeler" },
          { href: "/admin/settings/theme", label: "Işık" },
        ],
      },
    ];
    expect(filterAdminNavigation(turkish, "iadeler", "tr")[0].links).toEqual([
      turkish[0].links[0],
    ]);
    expect(filterAdminNavigation(turkish, "IŞIK", "tr")[0].links).toEqual([
      turkish[0].links[1],
    ]);
  });
});
