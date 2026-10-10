import { seal } from "@/lib/secure-tokens";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { registerJobHandler } from "@/modules/jobs";
import { storage } from "@/modules/integrations/storage";
import {
  openAiFittingProvider,
  ProviderFailure,
  type FittingProvider,
} from "@/modules/integrations/fitting";
import { refundSession } from "./index";
import { readConfig } from "./ledger";
import { snapshotSchema } from "./contracts";
export async function renderFitting(
  id: string,
  provider: FittingProvider = openAiFittingProvider,
) {
  const snapshot = await withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${id} FOR UPDATE`;
      const s = await tx.fittingSession.findUniqueOrThrow({ where: { id } });
      if (s.status === "RUNNING") {
        if (s.startedAt && Date.now() - s.startedAt.getTime() < 5 * 60000)
          return null;
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
    }),
  );
  if (!snapshot) return;
  let key: string | undefined;
  try {
    const raw = await provider.render(snapshot);
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
    key = `fitting/${new Date().getUTCFullYear()}/${randomUUID()}.sealed`;
    await storage.put(
      key,
      Buffer.from(
        seal({
          kind: "fitting-image",
          sessionId: id,
          webp: bytes.toString("base64"),
        }),
        "utf8",
      ),
      "application/octet-stream",
    );
    await withMutation(() =>
      db.$transaction(async (tx) => {
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
      }),
    );
  } catch (error) {
    if (key) await storage.delete(key).catch(() => {});
    await withMutation(() =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${id} FOR UPDATE`;
        if (error instanceof ProviderFailure && error.definitive)
          await refundSession(tx, id, "PROVIDER_FAILED");
        else {
          const s = await tx.fittingSession.findUniqueOrThrow({
            where: { id },
          });
          if (s.status === "RUNNING")
            await tx.fittingSession.update({
              where: { id },
              data: { status: "REVIEW", errorCode: "PROVIDER_UNKNOWN" },
            });
        }
      }),
    );
  }
}
export function registerFittingJobs() {
  registerJobHandler("fitting-render", async (job) => {
    const p = job.payload as { sessionId?: string };
    if (p.sessionId) await renderFitting(p.sessionId);
  });
}
