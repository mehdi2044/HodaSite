import type { Prisma } from "@prisma/client";
import { seal } from "@/lib/secure-tokens";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { MaintenanceError, withMutation } from "@/lib/mutation-gate";
import { JobDeferredError, registerJobHandler } from "@/modules/jobs";
import { storage } from "@/modules/integrations/storage";
import {
  openAiFittingProvider,
  ProviderFailure,
  type FittingProvider,
} from "@/modules/integrations/fitting";
import { refundSession } from "./index";
import { readConfig } from "./ledger";
import { snapshotSchema } from "./contracts";
async function queueOutputPurge(
  tx: Prisma.TransactionClient,
  id: string,
  storageKey: string,
) {
  // A late writer needs fresh work even if an earlier deletion is RUNNING/DONE.
  // Each request has its own durable job; deletion and DONE-output protection are idempotent.
  await tx.job.create({
    data: {
      type: "fitting-output-purge",
      payload: { sessionId: id, storageKey },
    },
  });
}
export async function renderFitting(
  id: string,
  provider: FittingProvider = openAiFittingProvider,
) {
  // Keep paid dispatch, delivery and settlement inside the restore drain.
  // An admitted attempt finishes even if maintenance starts; only new attempts are rejected.
  return withMutation(() => renderFittingAttempt(id, provider));
}
async function renderFittingAttempt(id: string, provider: FittingProvider) {
  const snapshot = await db.$transaction(async (tx) => {
    // Serialize admission with the admin kill switch before locking the session/wallet.
    await tx.$queryRaw`SELECT id FROM "Integration" WHERE key='fitting-room' FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${id} FOR UPDATE`;
    const s = await tx.fittingSession.findUniqueOrThrow({ where: { id } });
    if (s.status === "RUNNING") {
      if (s.startedAt && Date.now() - s.startedAt.getTime() < 5 * 60000)
        throw new JobDeferredError("FITTING_RUNNING");
      if (s.storageKey) {
        await refundSession(tx, id, "OUTPUT_INTERRUPTED");
        await queueOutputPurge(tx, id, s.storageKey);
        return null;
      }
      await tx.fittingSession.update({
        where: { id },
        data: { status: "REVIEW", errorCode: "INTERRUPTED" },
      });
      return null;
    }
    if (s.status !== "QUEUED") return null;
    const c = await readConfig(tx);
    const customer = await tx.customer.findUnique({
      where: { id: s.customerId },
    });
    if (!c.enabled || !customer?.isActive) {
      await refundSession(tx, id, "DISABLED");
      return null;
    }
    await tx.fittingSession.update({
      where: { id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    return snapshotSchema.parse(s.snapshot);
  });
  if (!snapshot) return;
  let key: string | undefined;
  let rendered = false;
  try {
    const raw = await provider.render(snapshot);
    rendered = true;
    let bytes: Buffer;
    try {
      bytes = await sharp(raw, { limitInputPixels: 16000000 })
        .resize({
          width: 1024,
          height: 1536,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new ProviderFailure(true);
    }
    const encrypted = Buffer.from(
      seal({
        kind: "fitting-image",
        sessionId: id,
        webp: bytes.toString("base64"),
      }),
      "utf8",
    );
    const candidate = `fitting/${new Date().getUTCFullYear()}/${randomUUID()}.sealed`;
    // Record the object identity before uploading so interruptions cannot orphan it.
    await db.$transaction(async (tx) => {
      const changed = await tx.fittingSession.updateMany({
        where: { id, status: "RUNNING" },
        data: { storageKey: candidate },
      });
      if (!changed.count) throw new ProviderFailure(false);
    });
    key = candidate;
    await storage.put(key, encrypted, "application/octet-stream");

    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${id} FOR UPDATE`;
      const s = await tx.fittingSession.findUniqueOrThrow({ where: { id } });
      if (s.status !== "RUNNING") throw new ProviderFailure(false);
      await tx.fittingSession.update({
        where: { id },
        data: {
          status: "DONE",
          storageKey: key,
          completedAt: new Date(),
          errorCode: null,
        },
      });
    });
  } catch (error) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${id} FOR UPDATE`;
      const s = await tx.fittingSession.findUniqueOrThrow({ where: { id } });
      // A commit response can be lost after DONE: keep its delivered image.
      if (s.status === "DONE") return false;
      if (rendered || (error instanceof ProviderFailure && error.definitive))
        await refundSession(tx, id, "PROVIDER_FAILED");
      else {
        if (s.status === "RUNNING")
          await tx.fittingSession.update({
            where: { id },
            data: { status: "REVIEW", errorCode: "PROVIDER_UNKNOWN" },
          });
      }
      if (s.storageKey) await queueOutputPurge(tx, id, s.storageKey);
      return true;
    });
  }
}
export function registerFittingJobs(
  provider: FittingProvider = openAiFittingProvider,
) {
  registerJobHandler("fitting-output-purge", async (job) => {
    const payload = job.payload as { sessionId?: string; storageKey?: string };
    if (
      !payload.sessionId ||
      !payload.storageKey ||
      !/^fitting\/\d{4}\/[a-f0-9-]{36}\.sealed$/.test(payload.storageKey)
    )
      throw new Error("INVALID_FITTING_PURGE");
    const key = payload.storageKey;
    try {
      await withMutation(async () => {
        const session = await db.fittingSession.findUnique({
          where: { id: payload.sessionId },
        });
        if (session?.storageKey === key && session.status === "DONE") return;
        if (
          session?.storageKey === key &&
          ["QUEUED", "RUNNING"].includes(session.status)
        )
          throw new JobDeferredError("FITTING_RUNNING");
        await storage.delete(key);
      });
    } catch (error) {
      if (error instanceof MaintenanceError)
        throw new JobDeferredError("MAINTENANCE");
      throw error;
    }
  });
  registerJobHandler("fitting-render", async (job) => {
    const p = job.payload as { sessionId?: string };
    try {
      if (p.sessionId) await renderFitting(p.sessionId, provider);
    } catch (error) {
      if (error instanceof MaintenanceError)
        throw new JobDeferredError("MAINTENANCE");
      throw error;
    }
  });
}
