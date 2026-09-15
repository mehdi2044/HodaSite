import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { canonicalOrigin } from "@/lib/seo";
import { MANUAL_GATES, withinAge, type LaunchCheck } from "./checks";
export const launchEvidenceInput = z.object({
  gate: z.enum(MANUAL_GATES),
  environment: z.enum(["local", "ci", "staging", "production"]),
  origin: z
    .string()
    .max(2048)
    .refine((v) => Boolean(canonicalOrigin(v))),
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  result: z.enum(["PASS", "FAIL"]),
  testedAt: z
    .union([z.date(), z.string().datetime({ offset: true })])
    .pipe(z.coerce.date()),
  reference: z.string().trim().min(8).max(1000),
  notes: z.string().trim().min(12).max(3000),
});
export type Evidence = z.infer<typeof launchEvidenceInput> & {
  id: string;
  createdAt: Date;
};
export function applyLaunchEvidence(
  checks: LaunchCheck[],
  evidence: Evidence[],
  target: { origin: string; revision: string },
  now = new Date(),
): LaunchCheck[] {
  return checks.map((check) => {
    if (check.kind !== "manual") return check;
    const latest = evidence
      .filter(
        (e) =>
          e.gate === check.id &&
          e.origin === target.origin &&
          e.revision === target.revision &&
          ["staging", "production"].includes(e.environment),
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )[0];
    if (!latest) return { ...check, status: "pending", at: null };
    return {
      ...check,
      status:
        latest.result === "FAIL"
          ? "blocked"
          : withinAge(latest.testedAt, 30 * 24, now)
            ? "pass"
            : "pending",
      at: latest.testedAt,
    };
  });
}
export async function recordLaunchEvidence(
  userId: string,
  raw: unknown,
  now = new Date(),
) {
  await assertCan(userId, "settings.maintenance.edit");
  const input = launchEvidenceInput
    .refine((v) => withinAge(v.testedAt, 30 * 24, now))
    .parse(raw);
  await withMutation(() =>
    db.$transaction(async (tx) => {
      const row = await tx.launchEvidence.create({
        data: { ...input, recordedBy: userId },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "launch.evidence.record",
          entityType: "LaunchEvidence",
          entityId: row.id,
          after: {
            gate: input.gate,
            result: input.result,
            environment: input.environment,
            revision: input.revision,
          },
        },
      });
    }),
  );
}
