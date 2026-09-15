import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  allowed: true,
  maintenanceOn: false,
  backup: vi.fn(),
  users: vi.fn(),
  markets: vi.fn(),
  settings: vi.fn(),
  tasks: vi.fn(),
  integrations: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    backup: { findFirst: state.backup },
    user: { findMany: state.users },
    market: { findMany: state.markets },
    siteSettings: { findUnique: state.settings },
    opsTask: { findFirst: state.tasks },
    integration: { findMany: state.integrations },
  },
}));
vi.mock("@/modules/access", () => ({
  assertCan: async () => {
    if (!state.allowed) throw new Error("fixture access denied");
  },
}));
vi.mock("@/modules/auth", async () => ({
  requiresMfa: (await import("@/modules/auth/security")).requiresMfa,
}));
vi.mock("@/modules/pricing", () => ({ getActiveRate: state.rate }));
vi.mock("@/modules/settings", async () => ({
  ...(await vi.importActual<typeof import("@/modules/settings")>(
    "@/modules/settings",
  )),
  isMaintenanceOn: async () => state.maintenanceOn,
}));
import { getLaunchReadiness } from "@/modules/launch";
const now = new Date("2026-09-15T12:00:00Z");
const owner = () => ({
  mfaEnabled: true,
  mfaSecret: "fixture-private-mfa",
  roles: [{ role: { key: "owner", permissions: [] } }],
  overrides: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
  state.maintenanceOn = false;
  state.backup.mockResolvedValue(null);
  state.tasks.mockResolvedValue(null);
  state.users.mockResolvedValue([owner()]);
  state.markets.mockResolvedValue([{ id: "tr", code: "TR", fxStaleHours: 24 }]);
  state.rate.mockResolvedValue({ at: now });
  state.settings.mockResolvedValue({ maintenance: { state: "off" } });
  state.integrations.mockResolvedValue([]);
});
describe("launch snapshot access, freshness and existing security policy", () => {
  it("denies access before reading any operational state", async () => {
    state.allowed = false;
    await expect(getLaunchReadiness("denied", now)).rejects.toThrow(
      "fixture access denied",
    );
    for (const fn of [
      state.backup,
      state.users,
      state.markets,
      state.settings,
      state.tasks,
      state.integrations,
      state.rate,
    ])
      expect(fn).not.toHaveBeenCalled();
  });
  it("uses the latest verification including failures and never returns identity secrets", async () => {
    state.backup.mockImplementation(async (query: { where?: unknown }) =>
      query.where
        ? {
            status: "DONE",
            mediaIncluded: true,
            verifiedAt: now,
            verifyResult: { ok: false, details: "fixture-private-path" },
          }
        : null,
    );
    const result = await getLaunchReadiness("reader", now);
    expect(result.checks.find((c) => c.id === "verify")?.status).toBe(
      "blocked",
    );
    expect(state.backup.mock.calls[1][0].where).toEqual({
      verifiedAt: { not: null },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-private|mfaSecret|verifyResult/,
    );
  });
  it("counts security-management roles and overrides under the existing MFA policy", async () => {
    for (const user of [
      {
        ...owner(),
        mfaEnabled: false,
        roles: [
          {
            role: {
              key: "custom",
              permissions: [{ permission: "users.manage" }],
            },
          },
        ],
      },
      {
        ...owner(),
        mfaEnabled: false,
        roles: [],
        overrides: [{ permission: "security.role.manage", allow: true }],
      },
      { ...owner(), mfaSecret: null },
    ]) {
      state.users.mockResolvedValue([owner(), user]);
      expect(
        (await getLaunchReadiness("reader", now)).checks.find(
          (c) => c.id === "mfa",
        )?.status,
      ).toBe("blocked");
    }
  });
  it("blocks missing, malformed, scheduled and operational maintenance states", async () => {
    for (const maintenance of [
      null,
      {},
      { state: "scheduled", startsAt: "invalid" },
      {
        state: "scheduled",
        startsAt: "2026-09-15T11:00:00Z",
        endsAt: "2026-09-15T13:00:00Z",
      },
    ]) {
      state.settings.mockResolvedValue({ maintenance });
      expect(
        (await getLaunchReadiness("reader", now)).checks.find(
          (c) => c.id === "maintenance",
        )?.status,
      ).toBe("blocked");
    }
    state.settings.mockResolvedValue({ maintenance: { state: "off" } });
    state.maintenanceOn = true;
    expect(
      (await getLaunchReadiness("reader", now)).checks.find(
        (c) => c.id === "maintenance",
      )?.status,
    ).toBe("blocked");
  });
  it("blocks active no-op integrations and an unavailable rate without hiding other checks", async () => {
    state.integrations.mockResolvedValue([{ provider: "noop" }]);
    state.rate.mockRejectedValue(new Error("fixture provider failure"));
    const result = await getLaunchReadiness("reader", now);
    expect(result.checks.find((c) => c.id === "providers")?.status).toBe(
      "blocked",
    );
    expect(result.checks.find((c) => c.id === "fx")).toMatchObject({
      status: "blocked",
      markets: ["TR"],
    });
    expect(result.checks.filter((c) => c.kind === "manual")).toHaveLength(14);
  });
});
