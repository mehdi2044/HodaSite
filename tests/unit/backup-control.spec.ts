import { describe, expect, it } from "vitest";
import {
  backupKey,
  backupOperationSchema,
  backupSettingsSchema,
  uploadInitSchema,
} from "@/modules/backups/validation";
import { randomUUID } from "node:crypto";
describe("backup command boundary", () => {
  it("accepts generated keys and rejects paths and shell arguments", () => {
    expect(
      backupKey.parse("2026-09-12_010203_123456789_panel-abc"),
    ).toBeTruthy();
    for (const key of [
      "../db",
      "/backups/x",
      "2026-09-12_0102_x/../secret",
      "2026-09-12_0102_$(id)",
    ])
      expect(backupKey.safeParse(key).success).toBe(false);
  });
  it("restore requires exactly one source, confirmation and TOTP", () => {
    const input = {
      type: "RESTORE",
      requestKey: randomUUID(),
      backupId: "backup",
      mode: "FULL",
      password: "StrongPassword",
      token: "123456",
      confirmed: true,
    };
    expect(backupOperationSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { confirmed: false },
      { token: "recovery-code" },
      { uploadId: randomUUID() },
      { backupId: undefined },
      { mode: "SHELL" },
      { command: "id" },
    ])
      expect(
        backupOperationSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
  it("limits upload sizes and schedule/retention settings", () => {
    expect(
      uploadInitSchema.safeParse({ name: "backup.zip", bytes: 1024 }).success,
    ).toBe(true);
    expect(
      uploadInitSchema.safeParse({ name: "backup.zip", bytes: 51 * 1024 ** 3 })
        .success,
    ).toBe(false);
    const base = {
      enabled: true,
      hourUtc: 3,
      includeMedia: true,
      keepDaily: 7,
      keepWeekly: 4,
      keepMonthly: 6,
      verifyWeekday: 0,
    };
    expect(backupSettingsSchema.safeParse(base).success).toBe(true);
    for (const patch of [
      { hourUtc: 24 },
      { keepDaily: 0 },
      { verifyWeekday: 7 },
    ])
      expect(
        backupSettingsSchema.safeParse({ ...base, ...patch }).success,
      ).toBe(false);
  });
});
