import { z } from "zod";
export const backupKey = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}_[0-9_]+_[a-zA-Z0-9_-]+$/);
export const backupSettingsSchema = z
  .object({
    enabled: z.boolean(),
    hourUtc: z.number().int().min(0).max(23),
    minuteUtc: z.number().int().min(0).max(59),
    includeMedia: z.boolean(),
    keepDaily: z.number().int().min(1).max(365),
    keepWeekly: z.number().int().min(0).max(104),
    keepMonthly: z.number().int().min(0).max(120),
    verifyWeekday: z.number().int().min(0).max(6),
  })
  .strict();
export const backupOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("BACKUP"),
      requestKey: z.uuid(),
      includeMedia: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["VERIFY", "EXPORT"]),
      requestKey: z.uuid(),
      backupId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("RESTORE"),
      requestKey: z.uuid(),
      backupId: z.string().max(100).optional(),
      uploadId: z.uuid().optional(),
      mode: z.enum(["FULL", "DB_ONLY", "MEDIA_ONLY"]),
      password: z.string().min(8).max(256),
      token: z.string().regex(/^\d{6}$/),
      confirmed: z.literal(true),
    })
    .strict()
    .refine((v) => Boolean(v.backupId) !== Boolean(v.uploadId)),
]);
export const uploadInitSchema = z
  .object({
    name: z.string().min(1).max(250).endsWith(".zip"),
    bytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 ** 3),
  })
  .strict();
export const CHUNK_BYTES = 5 * 1024 ** 2;

export const UPLOAD_FAILURE_CODES = [
  "ARCHIVE_INVALID",
  "ARCHIVE_MEMBERS",
  "ARCHIVE_PROJECT",
  "ARCHIVE_CHECKSUM",
  "ARCHIVE_MIGRATIONS",
  "ARCHIVE_RESTORE",
  "VALIDATION_FAILED",
] as const;
