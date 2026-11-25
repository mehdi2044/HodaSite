import { expect, it } from "vitest";
import {
  isolatedTestDatabaseUrl,
  isolatedTestDatabases,
} from "../helpers/isolated-database";
const shared = "postgresql://localhost/shared_test";
it("keeps the explicit standalone fallback when no dedicated fixture URL is configured", () => {
  expect(isolatedTestDatabaseUrl(undefined, shared, "Fixture")).toBeUndefined();
});
it("preserves a distinct test URL and its pool configuration", () => {
  const url = "postgresql://localhost/fixture_test?connection_limit=5";
  expect(isolatedTestDatabaseUrl(url, shared, "Fixture")).toBe(url);
});
it.each([
  ["missing shared URL", "postgresql://localhost/fixture_test", undefined],
  [
    "live shared database",
    "postgresql://localhost/fixture_test",
    "postgresql://localhost/store",
  ],
  ["live destination", "postgresql://localhost/store", shared],
  [
    "same database with different options",
    shared + "?connection_limit=5",
    shared,
  ],
  ["non-PostgreSQL destination", "https://localhost/fixture_test", shared],
] as const)("rejects %s before connecting", (_name, isolated, primary) => {
  expect(() => isolatedTestDatabaseUrl(isolated, primary, "Fixture")).toThrow(
    "dedicated PostgreSQL _test database",
  );
});
it("rejects a malformed destination before connecting", () => {
  expect(() =>
    isolatedTestDatabaseUrl("not a URL", shared, "Fixture"),
  ).toThrow();
});
it("rejects two fixture contexts using the same destination", () => {
  const url = "postgresql://localhost/fixture_test";
  expect(() =>
    isolatedTestDatabases(shared, [
      { url, label: "Editorial" },
      { url, label: "Fitting" },
    ]),
  ).toThrow("distinct from one another");
});
