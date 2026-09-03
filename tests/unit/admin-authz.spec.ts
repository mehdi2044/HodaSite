import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ADMIN_DIR = join(process.cwd(), "src", "app", "admin");

function findActionFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findActionFiles(full));
    else if (entry.name === "actions.ts") out.push(full);
  }
  return out;
}

const actionFiles = findActionFiles(ADMIN_DIR);

describe("every admin server action is authorized (fix-order A2)", () => {
  it("finds at least one src/app/admin/**/actions.ts file", () => {
    // Fails loudly if the glob matches nothing — the check must never pass
    // vacuously.
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  it.each(actionFiles.map((f) => [relative(process.cwd(), f), f]))(
    "%s calls assertCan()",
    (_label, file) => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/\bassertCan\s*\(/);
    },
  );
});
