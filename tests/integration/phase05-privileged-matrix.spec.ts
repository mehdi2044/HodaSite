import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const acting = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/modules/auth", () => ({
  auth: async () => (acting.userId ? { user: { id: acting.userId } } : null),
}));
import { db } from "@/lib/db";
import {
  SUBJECTS,
  GLOBAL_SCOPES,
  granted,
  matrixSubjects,
  form,
  fingerprint,
  errorCode,
  MATRIX_SECRET,
  MATRIX_PASSWORD,
  type MatrixSubject,
} from "../helpers/permission-subjects";
import { backupAction } from "@/app/admin/(dashboard)/system/backups/actions";
import { POST as uploadBackup } from "@/app/api/admin/backups/upload/route";
import { POST as uploadMedia } from "@/app/api/uploads/route";
import { receiveInventory } from "@/app/admin/(dashboard)/inventory/actions";
import { sendNotificationTest } from "@/app/admin/(dashboard)/settings/notifications/actions";
import { totpFor } from "@/modules/auth/security";
import { seal } from "@/lib/secure-tokens";
let subjects: MatrixSubject[] = [],
  backupId = "",
  variantId = "",
  warehouseId = "",
  templateId = "";
const tables = [
  "OpsTask",
  "RestoreRequest",
  "BackupUpload",
  "Media",
  "Job",
  "StockItem",
  "StockMovement",
  "Lot",
  "AuditLog",
];
const permissions = [
  "backup.create",
  "backup.restore",
  "backup.upload",
  "media.upload",
  "inventory.receive",
  "settings.notification.test",
];
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "V-4 privileged server actions and upload routes",
  () => {
    beforeAll(async () => {
      subjects = await matrixSubjects();
      vi.stubEnv("EMAIL_PROVIDER", "noop");
      backupId = (
        await db.backup.create({
          data: {
            kind: "manual",
            status: "DONE",
            fileKey: "2026-09-12_000002_matrix",
            sizeBytes: 1n,
            mediaIncluded: true,
          },
        })
      ).id;
      const source = await db.variant.findFirstOrThrow({
        include: { product: true },
      });
      const p = await db.product.create({
        data: {
          categoryId: source.product.categoryId,
          gender: "UNISEX",
          titleI18n: {},
          slugI18n: {},
          descriptionI18n: {},
          basePriceAmount: "1",
        },
      });
      variantId = (
        await db.variant.create({
          data: {
            productId: p.id,
            colorId: source.colorId,
            sizeId: source.sizeId,
            sku: `ZZ-MATRIX-${randomUUID()}`,
          },
        })
      ).id;
      warehouseId = (
        await db.warehouse.findFirstOrThrow({ where: { isActive: true } })
      ).id;
      templateId = (
        await db.notificationTemplate.findFirstOrThrow({
          where: { key: "order.placed", isActive: true },
        })
      ).id;
    }, 60000);
    afterAll(() => {
      acting.userId = null;
      vi.unstubAllEnvs();
    });
    for (const permission of permissions)
      for (const name of SUBJECTS)
        for (const scope of GLOBAL_SCOPES)
          for (const forged of [false, true]) {
            it(`${permission} / ${name} / ${scope} / ${forged ? "direct crafted request" : "UI request payload"}`, async () => {
              acting.userId = subjects.find(
                (s) => s.name === name && s.scope === scope,
              )!.id;
              const allowed = scope === "in" && granted(name, permission);
              // Each successful restore has a newly enrolled test owner. Production MFA
              // replay checks are exercised unchanged; the other matrix actor is not reset.
              if (permission === "backup.restore" && allowed) {
                const role = await db.role.findUniqueOrThrow({
                  where: { key: "owner" },
                });
                const source = await db.user.findUniqueOrThrow({
                  where: { id: acting.userId! },
                });
                acting.userId = (
                  await db.user.create({
                    data: {
                      email: `mfa-matrix-${randomUUID()}@example.com`,
                      name: "Restore matrix",
                      passwordHash: source.passwordHash,
                      mfaEnabled: true,
                      mfaSecret: seal(MATRIX_SECRET),
                      roles: { create: { roleId: role.id } },
                    },
                  })
                ).id;
              }
              const before = await fingerprint(tables);
              let result: unknown;
              try {
                if (permission === "backup.create")
                  result = await backupAction({
                    type: "BACKUP",
                    requestKey: randomUUID(),
                    includeMedia: forged,
                  });
                if (permission === "backup.restore")
                  result = await backupAction({
                    type: "RESTORE",
                    requestKey: randomUUID(),
                    backupId,
                    mode: forged ? "DB_ONLY" : "FULL",
                    password: MATRIX_PASSWORD,
                    token: totpFor(MATRIX_SECRET).generate(),
                    confirmed: true,
                  });
                if (permission === "backup.upload") {
                  const response = await uploadBackup(
                    new NextRequest(
                      "http://localhost/api/admin/backups/upload",
                      {
                        method: "POST",
                        headers: {
                          origin: "http://localhost",
                          "content-type": "application/json",
                        },
                        body: JSON.stringify({
                          name: forged ? "../../matrix.zip" : "matrix.zip",
                          bytes: 6,
                        }),
                      },
                    ),
                  );
                  result = response.ok
                    ? await response.json()
                    : {
                        error:
                          response.status === 401
                            ? "UNAUTHORIZED"
                            : "FORBIDDEN",
                        status: response.status,
                      };
                  if (!allowed)
                    expect(response.status).toBe(
                      name === "anonymous" ? 401 : 403,
                    );
                }
                if (permission === "media.upload") {
                  const payload = form({}, forged);
                  payload.set(
                    "file",
                    new File(
                      ["%PDF-1.4\nMatrix upload fixture\n%%EOF"],
                      forged ? "../../matrix.pdf" : "matrix.pdf",
                      { type: "application/pdf" },
                    ),
                  );
                  const response = await uploadMedia(
                    new Request("http://localhost/api/uploads", {
                      method: "POST",
                      body: payload,
                    }),
                  );
                  result = response.ok
                    ? await response.json()
                    : {
                        error:
                          response.status === 401
                            ? "UNAUTHORIZED"
                            : "FORBIDDEN",
                        status: response.status,
                      };
                  if (!allowed)
                    expect(response.status).toBe(
                      name === "anonymous" ? 401 : 403,
                    );
                }
                if (permission === "inventory.receive")
                  result = await receiveInventory(
                    null,
                    form(
                      {
                        warehouseId,
                        variantId,
                        quantity: "1",
                        unitCostAmount: "1",
                        unitCostCurrency: "TRY",
                        receivedAt: new Date().toISOString(),
                      },
                      forged,
                    ),
                  );
                if (permission === "settings.notification.test")
                  result = await sendNotificationTest(
                    null,
                    form(
                      {
                        id: templateId,
                        locale: forged ? "fa" : "en",
                        recipient: "matrix@example.com",
                      },
                      forged,
                    ),
                  );
              } catch (e) {
                result = { error: errorCode(e) };
              }
              if (allowed) {
                expect(result).not.toHaveProperty("error");
                expect(result).not.toMatchObject({ ok: false });
                expect(await fingerprint(tables)).not.toEqual(before);
              } else {
                const code =
                  (result as { error?: string; code?: string }).error ??
                  (result as { code?: string }).code;
                expect(code).toBe(
                  name === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN",
                );
                expect(await fingerprint(tables)).toEqual(before);
              }
            });
          }
  },
);
