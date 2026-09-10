import { expect, it, vi } from "vitest";
vi.mock("@/modules/settings", () => ({ isMaintenanceOn: async () => true }));
import { db } from "@/lib/db";
import {
  authenticateAdmin,
  beginMfaEnrollment,
  finishMfaEnrollment,
  requireFreshMfa,
  revokeAdminSession,
} from "@/modules/auth/security";
it("blocks every authentication write before throttling or session updates during restore maintenance", async () => {
  const transaction = vi.spyOn(db, "$transaction");
  const revoke = vi.spyOn(db.adminSession, "updateMany");
  try {
    for (const run of [
      () =>
        authenticateAdmin(
          {
            email: "maintenance@example.com",
            password: "ValidTest123!",
            token: "",
          },
          "test",
          "test",
        ),
      () => beginMfaEnrollment("user", "ValidTest123!", "Test"),
      () => finishMfaEnrollment("user", "123456"),
      () => requireFreshMfa("user", "ValidTest123!", "123456"),
      () => revokeAdminSession("session"),
    ])
      await expect(run()).rejects.toThrow("MAINTENANCE");
    expect(transaction).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});
