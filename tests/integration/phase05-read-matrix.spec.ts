import React from "react";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const acting = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.userId ? { user: { id: acting.userId } } : null),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "fa",
  getTranslations: async () =>
    Object.assign((key: string) => key, { has: () => true }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  granted,
  matrixSubjects,
  type MatrixSubject,
} from "../helpers/permission-subjects";
import Audit from "@/app/admin/(dashboard)/security/audit/page";
import Backups from "@/app/admin/(dashboard)/system/backups/page";
import Products from "@/app/admin/(dashboard)/catalog/products/page";
import Homepage from "@/app/admin/(dashboard)/content/homepage/page";
import Menus from "@/app/admin/(dashboard)/content/menus/page";
import Pages from "@/app/admin/(dashboard)/content/pages/page";
import Translations from "@/app/admin/(dashboard)/content/translations/page";
import Inventory from "@/app/admin/(dashboard)/inventory/page";
import Notifications from "@/app/admin/(dashboard)/settings/notifications/page";
import Health from "@/app/admin/(dashboard)/system/health/page";
import Users from "@/app/admin/(dashboard)/users/page";
import { adminInventoryCosts } from "@/modules/inventory/admin-costs";
function textNodes(node: React.ReactNode): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(textNodes);
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return textNodes(node.props.children);
  return [];
}
const query = (forged: boolean) => ({
  searchParams: Promise.resolve(
    forged
      ? {
          userId: "seed-owner",
          permission: "*",
          scope: "{}",
          market: "IR",
          trash: "1",
          variantId: "unknown",
        }
      : {},
  ),
});
const rows = [
  { permission: "audit.view", run: (f: boolean) => Audit(query(f)) },
  { permission: "backup.view", run: () => Backups() },
  {
    permission: "catalog.product.view",
    run: (f: boolean) => Products(query(f)),
  },
  { permission: "content.homepage.read", run: () => Homepage() },
  { permission: "content.menu.read", run: () => Menus() },
  { permission: "content.page.read", run: (f: boolean) => Pages(query(f)) },
  { permission: "content.translation.read", run: () => Translations() },
  { permission: "inventory.view", run: (f: boolean) => Inventory(query(f)) },
  { permission: "settings.notification.read", run: () => Notifications() },
  { permission: "system.health.view", run: () => Health() },
  { permission: "users.view", run: () => Users() },
];
let subjects: MatrixSubject[] = [];
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "V-4 actual server-rendered reads × role × scope × forged route query",
  () => {
    beforeAll(async () => {
      vi.stubGlobal("React", React);
      subjects = await matrixSubjects();
    }, 60000);
    afterAll(() => {
      acting.userId = null;
    });
    for (const row of rows)
      for (const name of SUBJECTS)
        for (const scope of GLOBAL_SCOPES)
          for (const forged of [false, true]) {
            it(`${row.permission} / ${name} / ${scope} / ${forged ? "forged route query" : "UI server page"}`, async () => {
              acting.userId = subjects.find(
                (s) => s.name === name && s.scope === scope,
              )!.id;
              if (scope === "in" && granted(name, row.permission))
                expect(React.isValidElement(await row.run(forged))).toBe(true);
              else
                await expect(row.run(forged)).rejects.toThrow(
                  /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK;404|FORBIDDEN/,
                );
            });
          }
    for (const name of SUBJECTS)
      for (const scope of GLOBAL_SCOPES)
        for (const direct of [false, true]) {
          it(`pricing.cost.view / ${name} / ${scope} / ${direct ? "direct service" : "inventory UI read"}`, async () => {
            acting.userId = subjects.find(
              (s) => s.name === name && s.scope === scope,
            )!.id;
            const allowed =
              scope === "in" && granted(name, "pricing.cost.view");
            if (direct) {
              if (allowed)
                expect(
                  (await adminInventoryCosts(acting.userId ?? "")).length,
                ).toBeGreaterThan(0);
              else
                await expect(
                  adminInventoryCosts(acting.userId ?? ""),
                ).rejects.toThrow("FORBIDDEN");
            } else {
              if (scope === "in" && granted(name, "inventory.view")) {
                const content = textNodes(await Inventory(query(true)));
                expect(content.includes("originalCost")).toBe(allowed);
              } else
                await expect(Inventory(query(true))).rejects.toThrow(
                  /NEXT_REDIRECT|FORBIDDEN/,
                );
            }
          });
        }
  },
);
