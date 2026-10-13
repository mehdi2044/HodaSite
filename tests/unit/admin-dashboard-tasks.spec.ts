import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Dashboard from "../../src/app/admin/(dashboard)/page";

const access = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock("@/modules/auth", () => ({
  auth: async () => ({ user: { id: "dashboard-test-admin" } }),
}));
vi.mock("@/modules/access", () => ({
  can: async (_id: string, permission: string) =>
    access.permissions.has(permission),
}));
vi.mock("@/modules/orders", () => ({ visibleOrderMarkets: async () => [] }));
vi.mock("@/lib/db", () => ({
  db: { order: { groupBy: async () => [], count: async () => 0 } },
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => access.permissions.clear());
const render = async () => renderToStaticMarkup(await Dashboard());

describe("dashboard tasks require destination access and the advertised action", () => {
  it("does not advertise mutations to catalog or homepage readers", async () => {
    access.permissions.add("catalog.product.view").add("content.homepage.read");
    expect(await render()).not.toContain("admin-task-section");
  });
  it("does not advertise unreachable editors when read access is denied", async () => {
    access.permissions
      .add("catalog.product.create")
      .add("catalog.product.edit")
      .add("content.homepage.write");
    expect(await render()).not.toContain("admin-task-section");
  });
  it.each([
    [
      "/admin/catalog/products/new",
      ["catalog.product.view", "catalog.product.create"],
    ],
    [
      "/admin/catalog/taxonomy#taxonomy-category",
      ["catalog.product.view", "catalog.product.edit"],
    ],
    [
      "/admin/content/homepage",
      ["content.homepage.read", "content.homepage.write"],
    ],
    ["/admin/media", ["media.upload"]],
  ] as const)(
    "shows %s only while every required capability is granted",
    async (href, permissions) => {
      permissions.forEach((permission) => access.permissions.add(permission));
      expect(await render()).toContain(`href="${href}"`);
      for (const permission of permissions) {
        access.permissions.delete(permission);
        expect(await render()).not.toContain(`href="${href}"`);
        access.permissions.add(permission);
      }
    },
  );
});
