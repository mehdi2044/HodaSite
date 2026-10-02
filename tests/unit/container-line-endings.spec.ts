import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Linux scripts from a checkout", () => {
  const files = execFileSync("git", ["ls-files", "-z", "*.sh"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  it("includes real entrypoints", () => {
    expect(files).toContain("entrypoint.sh");
    expect(files).toContain("scripts/ops/run.sh");
  });
  it.each(files)("%s contains no CR bytes", (file) => {
    expect(readFileSync(file).includes(13)).toBe(false);
  });
});
