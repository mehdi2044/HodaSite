import { describe, expect, it } from "vitest";
import {
  configuredServices,
  launchChecks,
  MANUAL_GATES,
  type LaunchSnapshot,
} from "@/modules/launch/checks";

const now = new Date("2026-09-15T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3600000);
function healthy(): LaunchSnapshot {
  return {
    backup: {
      status: "DONE",
      mediaIncluded: true,
      finishedAt: ago(1),
      offsiteStatus: "OK",
      offsiteSyncedAt: ago(0.5),
    },
    verification: {
      status: "DONE",
      mediaIncluded: true,
      verifiedAt: ago(2),
      ok: true,
    },
    emailConfigured: true,
    offsiteConfigured: true,
    privilegedUsers: 1,
    missingMfa: 0,
    maintenanceOff: true,
    noopProviders: 0,
    markets: ["IR", "TR", "CA"].map((code) => ({ code, fresh: true })),
  };
}
function status(snapshot: LaunchSnapshot, id: string) {
  return launchChecks(snapshot, now).find((c) => c.id === id)?.status;
}
describe("pre-launch evidence never fabricates real acceptance", () => {
  it("accepts the backup script's default bucket with complete credentials", () => {
    const env = {
      BACKUP_OFFSITE_ENDPOINT: "https://backup.example.com",
      BACKUP_OFFSITE_KEY: "fixture-id",
      BACKUP_OFFSITE_SECRET: "fixture-secret",
    };
    expect(configuredServices(env).offsiteConfigured).toBe(true);
    expect(
      configuredServices({ ...env, BACKUP_OFFSITE_BUCKET: "" })
        .offsiteConfigured,
    ).toBe(true);
    expect(
      configuredServices({ ...env, BACKUP_OFFSITE_KEY: "" }).offsiteConfigured,
    ).toBe(false);
  });
  it("validates SMTP port boundaries without claiming delivery", () => {
    const env = {
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "mail.example.com",
      EMAIL_FROM: "shop@example.com",
    };
    for (const SMTP_PORT of [undefined, "1", "587", "65535"])
      expect(configuredServices({ ...env, SMTP_PORT }).emailConfigured).toBe(
        true,
      );
    for (const SMTP_PORT of [
      "",
      " ",
      "text",
      "0",
      "-1",
      "65536",
      "587.5",
      "Infinity",
      "NaN",
    ])
      expect(configuredServices({ ...env, SMTP_PORT }).emailConfigured).toBe(
        false,
      );
  });
  it("keeps every real-world gate unverified even with fully green automatic signals", () => {
    const checks = launchChecks(healthy(), now);
    expect(
      checks
        .filter((c) => c.kind === "automatic")
        .every((c) => c.status === "pass"),
    ).toBe(true);
    expect(checks.filter((c) => c.kind === "manual").map((c) => c.id)).toEqual([
      ...MANUAL_GATES,
    ]);
    expect(
      checks
        .filter((c) => c.kind === "manual")
        .every((c) => c.status === "pending"),
    ).toBe(true);
  });
  it.each([null, ago(36.001), ago(-1), new Date("invalid")])(
    "rejects missing, stale or impossible backup dates: %s",
    (finishedAt) => {
      const s = healthy();
      s.backup!.finishedAt = finishedAt;
      expect(status(s, "backup")).toBe("blocked");
      expect(status(s, "offsite")).toBe("blocked");
    },
  );
  it("accepts the exact backup freshness boundary", () => {
    const s = healthy();
    s.backup!.finishedAt = ago(36);
    expect(status(s, "backup")).toBe("pass");
  });
  it("rejects a database-only archive, missing configuration and failed mirror", () => {
    for (const patch of [{ mediaIncluded: false }, { status: "FAILED" }]) {
      const s = healthy();
      Object.assign(s.backup!, patch);
      expect(status(s, "backup")).toBe("blocked");
      expect(status(s, "offsite")).toBe("blocked");
    }
    const s = healthy();
    s.offsiteConfigured = false;
    expect(status(s, "offsite")).toBe("blocked");
    s.offsiteConfigured = true;
    s.backup!.offsiteStatus = "FAILED";
    expect(status(s, "offsite")).toBe("blocked");
  });
  it.each([null, ago(40), ago(-1), ago(2)])(
    "rejects missing, stale, future or pre-backup mirror dates: %s",
    (offsiteSyncedAt) => {
      const s = healthy();
      s.backup!.offsiteSyncedAt = offsiteSyncedAt;
      expect(status(s, "offsite")).toBe("blocked");
    },
  );
  it("never hides a later failed or pending operation behind old successful evidence", () => {
    for (const operationStatus of ["FAILED", "PENDING", "RUNNING"]) {
      const s = healthy();
      s.backupTask = s.verifyTask = {
        status: operationStatus,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      };
      expect(status(s, "backup")).toBe("blocked");
      expect(status(s, "offsite")).toBe("blocked");
      expect(status(s, "verify")).toBe("blocked");
    }
    const s = healthy();
    s.backupTask = {
      status: "FAILED",
      createdAt: ago(10),
      startedAt: ago(10),
      finishedAt: ago(10),
    };
    expect(status(s, "backup")).toBe("pass");
  });
  it("requires a successful, recent full verification, including no future timestamp", () => {
    for (const verification of [
      null,
      { ...healthy().verification!, ok: false },
      { ...healthy().verification!, mediaIncluded: false },
      { ...healthy().verification!, verifiedAt: ago(169) },
      { ...healthy().verification!, verifiedAt: ago(-1) },
    ]) {
      const s = healthy();
      s.verification = verification;
      expect(status(s, "verify")).toBe("blocked");
    }
  });
  it("does not approve absent markets, stale rates, absent admins, missing MFA or maintenance", () => {
    const s = healthy();
    s.markets = [];
    expect(status(s, "fx")).toBe("blocked");
    s.markets = [{ code: "IR", fresh: false }];
    expect(status(s, "fx")).toBe("blocked");
    s.privilegedUsers = 0;
    expect(status(s, "mfa")).toBe("blocked");
    s.privilegedUsers = 2;
    s.missingMfa = 1;
    expect(status(s, "mfa")).toBe("blocked");
    s.maintenanceOff = false;
    expect(status(s, "maintenance")).toBe("blocked");
    s.noopProviders = 1;
    expect(status(s, "providers")).toBe("blocked");
  });
  it("treats no-op, unknown and incomplete mail providers as unconfigured without returning secrets", () => {
    for (const env of [
      {},
      { EMAIL_PROVIDER: "noop", EMAIL_FROM: "shop@example.com" },
      { EMAIL_PROVIDER: "other", EMAIL_FROM: "shop@example.com" },
      { EMAIL_PROVIDER: "resend", EMAIL_FROM: "shop@example.com" },
      {
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "   ",
        EMAIL_FROM: "shop@example.com",
      },
    ])
      expect(configuredServices(env).emailConfigured).toBe(false);
    const env = {
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "shop@example.com",
      RESEND_API_KEY: "fixture-private-key",
      BACKUP_OFFSITE_ENDPOINT: "https://backup.example.com",
      BACKUP_OFFSITE_KEY: "fixture-id",
      BACKUP_OFFSITE_SECRET: "fixture-secret",
      BACKUP_OFFSITE_BUCKET: "backups",
    };
    expect(configuredServices(env)).toEqual({
      emailConfigured: true,
      offsiteConfigured: true,
    });
    expect(JSON.stringify(configuredServices(env))).not.toMatch(
      /fixture|example/,
    );
    expect(
      configuredServices({ ...env, BACKUP_OFFSITE_SECRET: " " })
        .offsiteConfigured,
    ).toBe(false);
    expect(
      configuredServices({
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "mail.example.com",
        EMAIL_FROM: "shop@example.com",
      }).emailConfigured,
    ).toBe(true);
  });
});
