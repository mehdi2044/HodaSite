import { type Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { registerJobHandler, JobDeferredError } from "@/modules/jobs";
import { aiAccess, sessionActor } from "./access";
import { productFacts, generateForActor } from "./products";
import { digest } from "./gateway";
import { AiError } from "./contracts";
export async function queueProducts(raw: unknown) {
  const v = z
    .object({
      productIds: z.array(z.string().min(1).max(100)).min(1).max(20),
      requestKey: z.string().min(8).max(100),
      confirm: z.literal(true),
    })
    .strict()
    .parse(raw);
  const actor = await sessionActor();
  await aiAccess(actor, "ai.product.generate");
  await aiAccess(actor, "catalog.product.edit");
  return withMutation(async () => {
    const inputs: {
      id: string;
      facts: Awaited<ReturnType<typeof productFacts>>["facts"];
      mediaIds: string[];
    }[] = [];
    for (const id of [...new Set(v.productIds)]) {
      const p = await productFacts(id);
      if (p.product.status !== "DRAFT") throw new AiError("DRAFT_ONLY", true);
      inputs.push({
        id,
        facts: p.facts,
        mediaIds: p.product.media.slice(0, 2).map((m) => m.mediaId),
      });
    }
    await db.$transaction(async (tx) => {
      await aiAccess(actor, "ai.product.generate", {}, tx);
      for (const p of inputs) {
        const requestKey = digest({
          actor,
          key: v.requestKey,
          productId: p.id,
        });
        const id = `ai:${requestKey}`;
        await tx.job.upsert({
          where: { id },
          create: {
            id,
            type: "ai-product",
            payload: {
              actor,
              productId: p.id,
              requestKey,
              facts: p.facts as Prisma.InputJsonValue,
              mediaIds: p.mediaIds,
            },
          },
          update: {},
        });
      }
    });
    return inputs.length;
  });
}
export function registerAiJobs() {
  registerJobHandler("ai-product", async (job) => {
    const v = z
      .object({
        actor: z.string(),
        productId: z.string(),
        requestKey: z.string(),
        facts: z.record(z.string(), z.unknown()),
        mediaIds: z.array(z.string()),
      })
      .parse(job.payload);
    await aiAccess(v.actor, "ai.product.generate");
    await aiAccess(v.actor, "catalog.product.edit");
    const p = await productFacts(v.productId);
    if (p.product.status !== "DRAFT") throw new AiError("DRAFT_ONLY", true);
    try {
      await generateForActor(v.actor, {
        productId: v.productId,
        requestKey: v.requestKey,
        facts: v.facts,
        mediaIds: v.mediaIds,
        vision: false,
        task: "generate",
      });
    } catch (error) {
      if (error instanceof AiError && error.code === "BUSY")
        throw new JobDeferredError("AI_BUSY");
      throw error instanceof AiError ? error : new Error("AI_JOB_FAILED");
    }
  });
}
