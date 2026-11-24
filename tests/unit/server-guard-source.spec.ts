import ts from "typescript";
import { expect, it } from "vitest";
import {
  mayContainServerGuard,
  SERVER_GUARD_NAMES,
} from "../helpers/server-guard-source";

it.each([
  'can(actor, "order.view")',
  'assertCan\n(actor, "order.view")',
  'requireAdminPage /* comment */ ("order.view")',
  'assertCan<Actor>(actor, "order.view")',
  'a\\u0073sertCan(actor, "order.view")',
  '\\u{63}an(actor, "order.view")',
  'authorizedMarketIds(actor, "order.view")',
  'authorizedM\\u0061rketIds(actor, "order.view")',
])("retains an AST-visible guard in %s", (text) => {
  const source = ts.createSourceFile(
    "fixture.ts",
    text,
    ts.ScriptTarget.Latest,
  );
  let guards = 0;
  const walk = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      SERVER_GUARD_NAMES.includes(node.expression.text)
    )
      guards++;
    ts.forEachChild(node, walk);
  };
  walk(source);
  expect(guards).toBe(1);
  expect(mayContainServerGuard(text)).toBe(true);
});

it("excludes only source without any guard spelling or Unicode escape", () => {
  expect(mayContainServerGuard("export const total = 1;")).toBe(false);
  expect(mayContainServerGuard("cancelOrder(actor)")).toBe(false);
  // Harmless false positives still receive the full AST check.
  expect(mayContainServerGuard("// assertCan is documented here")).toBe(true);
  expect(mayContainServerGuard('const title = "\\u0041"')).toBe(true);
});
