import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PERMISSIONS } from "@/modules/access/namespace";
import coverage from "../fixtures/phase05-operational-coverage.json";
function sources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(path.join(root, entry.name))
      : /\.(ts|tsx)$/.test(entry.name)
        ? [path.join(root, entry.name)]
        : [],
  );
}
describe("V-4 operational coverage registry", () => {
  it("fails when any namespace permission has no operational/deferred-phase row", () => {
    expect(Object.keys(coverage).sort()).toEqual([...PERMISSIONS].sort());
  });
  for (const [permission, row] of Object.entries(coverage))
    it(permission, () => {
      if ("tests" in row) {
        expect(row.tests.length).toBeGreaterThan(0);
        for (const file of row.tests) {
          const source = readFileSync(file, "utf8");
          expect(source).toContain(`"${permission}"`);
          expect(source).toContain("SUBJECTS");
          expect(source).toContain("TEST_DATABASE_URL");
        }
      } else {
        expect([6, 9]).toContain(row.reservedPhase);
        // Reserved means NO production surface. A new implementation cannot quietly
        // inherit this exemption: its permission guard immediately fails this test.
        const implementations = sources("src").filter(
          (file) =>
            file !== "src/modules/access/namespace.ts" &&
            readFileSync(file, "utf8").includes(permission),
        );
        expect(implementations).toEqual([]);
      }
    });
});
