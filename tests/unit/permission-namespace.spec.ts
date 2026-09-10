import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import { PERMISSIONS } from "@/modules/access/namespace";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}
it("every literal permission used at a server guard belongs to the declared namespace", () => {
  const missing: string[] = [],
    seen = new Set<string>();
  for (const file of files("src")) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["can", "assertCan", "requireAdminPage"].includes(node.expression.text)
      ) {
        const index = node.expression.text === "requireAdminPage" ? 0 : 1,
          arg = node.arguments[index];
        if (arg && ts.isStringLiteral(arg)) {
          seen.add(arg.text);
          if (!(PERMISSIONS as readonly string[]).includes(arg.text))
            missing.push(`${file}: ${arg.text}`);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  expect(seen.size).toBeGreaterThan(25);
  expect(missing).toEqual([]);
});
