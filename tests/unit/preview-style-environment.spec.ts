import { describe, expect, it } from "vitest";
import { requireLocalPreview } from "../../scripts/lib/preview-style-catalog";

const preview = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://preview:fixture@postgres:5432/hoda",
  STORAGE_PROVIDER: "local",
  MEDIA_DIR: "/data/media",
} as const;

describe("preview-only demo import boundary", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("accepts development preview %s", (APP_URL) => {
    expect(() => requireLocalPreview({ ...preview, APP_URL })).not.toThrow();
  });
  it.each([
    undefined,
    "",
    "https://shop.example.com",
    "http://localhost.evil.example",
    "not a url",
  ])("rejects other destinations %s", (APP_URL) => {
    expect(() => requireLocalPreview({ ...preview, APP_URL })).toThrow(
      "local development",
    );
  });
  it("rejects production even on loopback", () => {
    expect(() =>
      requireLocalPreview({
        ...preview,
        NODE_ENV: "production",
        APP_URL: "http://localhost:3000",
      }),
    ).toThrow();
  });
  it.each([
    "postgresql://preview:fixture@localhost:55432/hoda",
    "postgres://preview:fixture@127.0.0.1/hoda?schema=public",
    "postgresql://preview:fixture@[::1]:55432/hoda",
  ])("accepts a local database %s", (DATABASE_URL) => {
    expect(() =>
      requireLocalPreview({ ...preview, DATABASE_URL }),
    ).not.toThrow();
  });
  it.each([
    undefined,
    "",
    "postgresql://preview:fixture@db.example.com/hoda",
    "postgresql://preview:fixture@203.0.113.1/hoda",
    "postgresql://preview:fixture@postgres.example.com/hoda",
    "postgresql://preview:fixture@127.0.0.1/hoda?host=db.example.com",
    "postgresql://preview:fixture@postgres/hoda?host=/remote/socket",
    "mysql://preview:fixture@localhost/hoda",
    "postgresql://preview:fixture@localhost",
  ])(
    "rejects an unverified database despite a loopback app %s",
    (DATABASE_URL) => {
      expect(() => requireLocalPreview({ ...preview, DATABASE_URL })).toThrow();
    },
  );
  it.each(["s3", "remote", ""])(
    'rejects storage provider "%s"',
    (STORAGE_PROVIDER) => {
      expect(() =>
        requireLocalPreview({ ...preview, STORAGE_PROVIDER }),
      ).toThrow("local filesystem");
    },
  );
  it.each([
    "media",
    "https://media.example.com",
    "//files.example.com/media",
    "\\\\files.example.com\\media",
  ])("rejects nonlocal media paths %s", (MEDIA_DIR) => {
    expect(() => requireLocalPreview({ ...preview, MEDIA_DIR })).toThrow(
      "local filesystem",
    );
  });
  it.each(["/data/media", "C:\\preview\\media"])(
    "accepts an absolute local media path %s",
    (MEDIA_DIR) => {
      expect(() =>
        requireLocalPreview({ ...preview, MEDIA_DIR }),
      ).not.toThrow();
    },
  );
});
