import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

// The append-only trigger is a Postgres object — needs a database.
const hasDb = await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

describe.skipIf(!hasDb)("AuditLog is append-only (B11 / D24)", () => {
  // The CI database is ephemeral, so leaving the test rows is fine — and
  // deleting them is itself blocked by the trigger under test.
  async function seedRow() {
    return db.auditLog.create({
      data: {
        action: "test.append-only",
        entityType: "Test",
        entityId: "x",
        after: { a: 1 },
      },
    });
  }

  it("allows INSERT", async () => {
    const row = await seedRow();
    expect(row.id).toBeTruthy();
  });

  it("rejects UPDATE", async () => {
    const row = await seedRow();
    await expect(
      db.auditLog.update({
        where: { id: row.id },
        data: { action: "test.append-only" },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects DELETE", async () => {
    const row = await seedRow();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/i,
    );
  });
});
