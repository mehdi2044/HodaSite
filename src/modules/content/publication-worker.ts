import { z } from "zod";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/modules/access";
import { MaintenanceError } from "@/lib/mutation-gate";
import { RevisionConflictError } from "@/lib/revision-conflict";
import {
  JobDeferredError,
  JobPermanentError,
  registerJobHandler,
  type JobContext,
} from "@/modules/jobs";
import { publishHomepageRevision } from "./publication";
import { revalidateTag } from "next/cache";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const payload = z
  .object({
    homepageId: id,
    revisionId: id,
    actorId: id,
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export async function executeHomepagePublication(job: JobContext) {
  const parsed = payload.safeParse(job.payload);
  if (!parsed.success) throw new JobPermanentError("INVALID_PAYLOAD");
  const input = parsed.data;
  // After a successful commit only cache invalidation may need retrying. An
  // immutable audit binds the retry to this job, actor, homepage and revision;
  // a later permission change must not turn that completed write into failure.
  const committed = await db.auditLog.findFirst({
    where: {
      entityType: "Homepage",
      entityId: input.homepageId,
      userId: input.actorId,
      action: "content.homepage.published",
      AND: [
        { after: { path: ["jobId"], equals: job.id } },
        { after: { path: ["revisionId"], equals: input.revisionId } },
      ],
    },
  });
  if (committed) {
    revalidateTag("homepage");
    return;
  }
  try {
    await publishHomepageRevision(input.actorId, {
      homepageId: input.homepageId,
      revisionId: input.revisionId,
      expectedVersion: input.expectedVersion,
      jobId: job.id,
    });
    // Publication commits before cache invalidation. A retry uses the immutable
    // successful job audit and never republishes over newer content.
  } catch (error) {
    if (error instanceof MaintenanceError)
      throw new JobDeferredError("MAINTENANCE");
    if (
      !(error instanceof RevisionConflictError) &&
      !(error instanceof ForbiddenError) &&
      !(error instanceof z.ZodError)
    )
      throw new Error("PUBLICATION_RETRY_REQUIRED");
    const code =
      error instanceof RevisionConflictError
        ? "CONFLICT"
        : error instanceof ForbiddenError
          ? "PERMISSION_CHANGED"
          : "INVALID_REFERENCES";
    await db.$transaction(async (tx) => {
      const result = await tx.homepage.updateMany({
        where: {
          id: input.homepageId,
          scheduledRevisionId: input.revisionId,
          scheduledVersion: input.expectedVersion,
        },
        data: { scheduleError: code },
      });
      if (result.count) {
        await tx.auditLog.create({
          data: {
            action: "content.homepage.schedule_failed",
            entityType: "Homepage",
            entityId: input.homepageId,
            after: { code, jobId: job.id, revisionId: input.revisionId },
          },
        });
        await tx.systemAlert.create({
          data: {
            severity: "WARNING",
            code: "HOMEPAGE_PUBLICATION_FAILED",
            message: code,
          },
        });
      }
    });
    throw new JobPermanentError(code);
  }
  revalidateTag("homepage");
}
export function registerHomepagePublicationJobs() {
  registerJobHandler("homepage-publish", executeHomepagePublication);
}
