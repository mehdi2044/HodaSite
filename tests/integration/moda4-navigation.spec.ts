import { describe, it, expect, vi } from "vitest";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "market" ? { value: "CA" } : undefined),
  }),
  headers: async () => new Headers(),
}));
import { db } from "@/lib/db";
import { GET } from "@/app/api/catalog/localized-path/route";
import { seoPath } from "@/lib/seo-urls";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "R2 translated public navigation",
  () => {
    it("resolves real product, category and published page in every enabled language", async () => {
      const market = await db.market.findUniqueOrThrow({
        where: { code: "CA" },
      });
      const product = await db.product.findUniqueOrThrow({
        where: { id: "seed-style-v2-women-coat" },
      });
      const category = await db.category.findUniqueOrThrow({
        where: { id: "seed-category-women" },
      });
      const page = await db.page.findUniqueOrThrow({
        where: { id: "seed-page-about" },
      });
      for (const [kind, entity] of [
        ["p", product],
        ["c", category],
        ["pages", page],
      ] as const) {
        const slug = entity.slugI18n as Record<string, string>;
        for (const target of market.enabledLocales) {
          const pathname = seoPath("en", "CA", kind, slug.en);
          const response = await GET(
            new Request(
              `http://localhost/api/catalog/localized-path?${new URLSearchParams({ pathname, target })}`,
            ),
          );
          expect(await response.json()).toEqual({
            href: seoPath(target, "CA", kind, slug[target]),
          });
          expect(response.headers.get("Cache-Control")).toContain("no-store");
        }
      }
    });
    it("rejects external/private/auth paths, malformed locale and missing references", async () => {
      for (const pathname of [
        "https://example.com/en/p/item",
        "/admin/content/pages/secret",
        "/en/account/login?next=/admin",
        "/en/unsubscribe/token",
        "/en/m/CA/p/item?secret=token",
      ]) {
        const response = await GET(
          new Request(
            `http://localhost/api/catalog/localized-path?${new URLSearchParams({ pathname, target: "fa" })}`,
          ),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ href: null });
      }
      for (const pathname of [
        "/en/m/INVALID/p/absent",
        "/en/m/CA/p/absent",
        "/en/m/CA/pages/absent",
      ]) {
        expect(
          await (
            await GET(
              new Request(
                `http://localhost/api/catalog/localized-path?${new URLSearchParams({ pathname, target: "fa" })}`,
              ),
            )
          ).json(),
        ).toEqual({ href: null });
      }
    });
  },
);
