import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "prisma/migrations/20260909090000_phase02_catalog/migration.sql",
  "utf8",
);
describe("Phase 02 catalog migration", () => {
  it("is additive and enables typo-tolerant full-text search", () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain('CREATE TRIGGER "Product_search_vector_trigger"');
    expect(sql).toContain('USING GIN ("searchVector")');
  });
});
