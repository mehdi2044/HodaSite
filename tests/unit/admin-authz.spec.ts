import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ADMIN_DIR = join(process.cwd(), "src", "app", "admin");
const SRC_DIR = join(process.cwd(), "src");

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

function findFiles(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, extensions));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
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

describe("assertCan() throws a typed ForbiddenError, not a raw Error (Phase 01a §4)", () => {
  it('no `new Error("FORBIDDEN")` remains anywhere in src/', () => {
    const files = findFiles(SRC_DIR, [".ts", ".tsx"]);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) =>
      readFileSync(f, "utf8").includes('new Error("FORBIDDEN")'),
    );
    expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([]);
  });
});
