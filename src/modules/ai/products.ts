import { Prisma } from "@prisma/client";
import { z } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { storage } from "@/modules/integrations/storage";
import { buildProductSearchText } from "@/modules/catalog/search";
import { aiAccess, sessionActor } from "./access";
import { completeTask, digest } from "./gateway";
import { AiError, type ImageInput } from "./contracts";
import {
  fieldKeys,
  proposalSchema,
  generationSchema,
  guardProposal,
  attributesSchema,
} from "./proposals";
const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
export async function productFacts(id: string) {
  const p = await db.product.findFirst({
    where: { id, deletedAt: null },
    include: { attributes: true, media: { select: { mediaId: true } } },
  });
  if (!p) throw new AiError("NOT_FOUND", true);
  const seo = obj(p.seoI18n);
  return {
    product: p,
    facts: {
      title: p.titleI18n,
      description: p.descriptionI18n,
      care: p.careI18n,
      seoTitle: seo.title ?? {},
      seoDescription: seo.description ?? {},
      seoKeywords: seo.keywords ?? {},
      material: p.material,
      fit: p.fit,
      season: p.season,
      originCountry: p.originCountry,
      tags: p.tags,
      attributes: p.attributes.map((a) => ({
        key: a.key,
        valueI18n: a.valueI18n,
      })),
      categoryId: p.categoryId,
    },
  };
}
/** Internal worker entry point; every run rechecks the original actor's current permission. */
export async function generateForActor(actor: string, raw: unknown) {
  const v = generationSchema.parse(raw);
  await aiAccess(actor, "ai.product.generate");
  await aiAccess(actor, "catalog.product.edit");
  const existing = v.productId ? await productFacts(v.productId) : null;
  if (!existing) await aiAccess(actor, "catalog.product.create");
  if (Buffer.byteLength(JSON.stringify(v.facts)) > 45000)
    throw new AiError("INPUT", true);
  const categories = await db.category.findMany({
    where: { deletedAt: null },
    select: { id: true, titleI18n: true },
    take: 200,
  });
  const media = await db.media.findMany({
    where: {
      id: { in: v.mediaIds },
      status: "READY",
      deletedAt: null,
      kind: "image",
      bytes: { lte: 10 * 1024 * 1024 },
    },
  });
  if (media.length !== v.mediaIds.length) throw new AiError("INPUT", true);
  if (v.mediaIds.length) await aiAccess(actor, "media.write");
  const images: ImageInput[] = [];
  if (v.vision)
    for (const m of media) {
      const bytes = await storage.getBytes(m.storageKey);
      if (!bytes || bytes.length > 10 * 1024 * 1024)
        throw new AiError("INPUT", true);
      const image = await sharp(bytes, { limitInputPixels: 40000000 })
        .resize({
          width: 512,
          height: 512,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 75 })
        .toBuffer();
      images.push({ mime: "image/jpeg", base64: image.toString("base64") });
    }
  const keys = [
    ...fieldKeys,
    "tags",
    "categoryId",
    "attributes",
    ...media.flatMap((m) => ["fa", "tr", "en"].map((l) => `alt.${m.id}.${l}`)),
  ];
  if (v.task === "field" && !keys.includes(v.field ?? ""))
    throw new AiError("INPUT", true);
  const data = {
    task: v.task,
    requestedField: v.field ?? null,
    facts: v.facts,
    existing: existing?.facts ?? null,
    categories,
    media: media.map((m) => ({ id: m.id, alt: m.altI18n })),
    instructions:
      "Return fields with keys from allowedKeys. Generate full fa/tr/en content; translate fills missing languages only. Specs are newline bullet text, tags and seoKeywords comma separated, attributes is a JSON array of {key,valueI18n:{fa,tr,en}}. Do not return prices, status, SKUs or stock. For regenerate return only requestedField. Unknown facts stay empty. Suggestions are unconfirmed and never applied.",
    allowedKeys: keys,
  };
  const result = await completeTask({
    actor,
    feature: "product",
    requestKey: v.requestKey,
    data,
    images,
    schema: proposalSchema,
    validate: (p) => {
      if (v.task === "field" && p.fields.some((f) => f.key !== v.field))
        throw new AiError("INVALID_RESPONSE");
      if (
        v.task === "translate" &&
        p.fields.some((f) => {
          const [k, l] = f.key.split(".");
          const before = obj(v.facts[k])[l];
          return (
            typeof before === "string" && before.trim() && before !== f.value
          );
        })
      )
        throw new AiError("INVALID_RESPONSE");
      return guardProposal(
        p,
        v.facts,
        categories.map((c) => c.id),
        media.map((m) => m.id),
      );
    },
  });
  await aiAccess(actor, "ai.product.generate");
  const draft = await db.aiDraft.upsert({
    where: { requestKey: v.requestKey },
    create: {
      requestKey: v.requestKey,
      userId: actor,
      productId: v.productId,
      productVersion: existing?.product.updatedAt,
      facts: {
        input: v.facts as Prisma.InputJsonValue,
        categoryIds: categories.map((c) => c.id),
        mediaIds: v.mediaIds,
      },
      proposal: result.result,
    },
    update: {},
  });
  if (draft.userId !== actor) throw new AiError("REQUEST_CONFLICT", true);
  return { ...result, draftId: draft.id };
}
export async function generateProduct(raw: unknown) {
  return withMutation(async () => generateForActor(await sessionActor(), raw));
}
export async function reviewDrafts() {
  const actor = await sessionActor();
  await aiAccess(actor, "ai.product.generate");
  await aiAccess(actor, "catalog.product.edit");
  return db.aiDraft.findMany({
    where: { userId: actor, status: "REVIEW", productId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
export async function applyProposal(raw: unknown) {
  const v = z
    .object({
      draftId: z.string().min(1).max(100),
      fields: proposalSchema.shape.fields,
      confirm: z.literal(true),
    })
    .strict()
    .parse(raw);
  const actor = await sessionActor();
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await aiAccess(actor, "ai.product.generate", {}, tx);
        await aiAccess(actor, "catalog.product.edit", {}, tx);
        await tx.$queryRaw`SELECT id FROM "AiDraft" WHERE id=${v.draftId} FOR UPDATE`;
        const draft = await tx.aiDraft.findUnique({ where: { id: v.draftId } });
        if (!draft || draft.userId !== actor || !draft.productId)
          throw new AiError("NOT_FOUND", true);
        const hash = digest(v.fields);
        if (draft.status === "APPLIED") {
          if (draft.appliedHash !== hash)
            throw new AiError("REQUEST_CONFLICT", true);
          return draft.productId;
        }
        if (draft.status !== "REVIEW") throw new AiError("CONFLICT", true);
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${draft.productId} FOR UPDATE`;
        const p = await tx.product.findUniqueOrThrow({
          where: { id: draft.productId },
          include: { variants: { select: { sku: true } } },
        });
        if (
          p.deletedAt ||
          p.updatedAt.getTime() !== draft.productVersion?.getTime()
        )
          throw new AiError("CONFLICT", true);
        if (p.status === "ACTIVE")
          await aiAccess(actor, "catalog.product.publish", {}, tx);
        const original = proposalSchema.parse(draft.proposal);
        if (
          !v.fields.length ||
          v.fields.some((f) => !original.fields.some((o) => o.key === f.key))
        )
          throw new AiError("INPUT", true);
        const facts = obj(draft.facts),
          categories = z.array(z.string()).parse(facts.categoryIds),
          mediaIds = z.array(z.string()).parse(facts.mediaIds);
        // Accepted edits are still subject to factual validation; no arbitrary HTML/content injection.
        guardProposal(
          { fields: v.fields, suggestions: [] },
          facts.input,
          categories,
          mediaIds,
        );
        const patch: Prisma.ProductUncheckedUpdateInput = {},
          seo = obj(p.seoI18n);
        const localized: Record<string, Record<string, unknown>> = {
          title: obj(p.titleI18n),
          description: obj(p.descriptionI18n),
          care: obj(p.careI18n),
          seoTitle: obj(seo.title),
          seoDescription: obj(seo.description),
          seoKeywords: obj(seo.keywords),
        };
        for (const f of v.fields) {
          const [key, locale, altLocale] = f.key.split(".");
          if (key === "alt") {
            await aiAccess(actor, "media.write", {}, tx);
            const linked = await tx.productMedia.findFirst({
              where: { productId: p.id, mediaId: locale },
            });
            if (!linked) throw new AiError("CONFLICT", true);
            const m = await tx.media.findFirst({
              where: {
                id: locale,
                kind: "image",
                status: "READY",
                deletedAt: null,
              },
            });
            if (!m) throw new AiError("CONFLICT", true);
            await tx.media.update({
              where: { id: m.id },
              data: {
                altI18n: {
                  ...obj(m.altI18n),
                  [altLocale]: f.value,
                } as Prisma.InputJsonValue,
              },
            });
          } else if (key === "categoryId") {
            if (f.value) {
              const c = await tx.category.findFirst({
                where: { id: f.value, deletedAt: null },
              });
              if (!c) throw new AiError("CONFLICT", true);
              patch.categoryId = f.value;
            }
          } else if (key === "tags")
            patch.tags = f.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 30);
          else if (key === "attributes")
            for (const a of attributesSchema.parse(JSON.parse(f.value || "[]")))
              await tx.productAttribute.upsert({
                where: { productId_key: { productId: p.id, key: a.key } },
                create: { productId: p.id, ...a },
                update: { valueI18n: a.valueI18n },
              });
          else if (key === "specs") {
            const old = await tx.productAttribute.findUnique({
              where: { productId_key: { productId: p.id, key: "specs" } },
            });
            const value = {
              ...obj(old?.valueI18n),
              [locale]: f.value,
            } as Prisma.InputJsonValue;
            await tx.productAttribute.upsert({
              where: { productId_key: { productId: p.id, key: "specs" } },
              create: { productId: p.id, key: "specs", valueI18n: value },
              update: { valueI18n: value },
            });
          } else {
            localized[key][locale] = f.value;
          }
        }
        patch.titleI18n = localized.title as Prisma.InputJsonValue;
        patch.descriptionI18n = localized.description as Prisma.InputJsonValue;
        patch.careI18n = localized.care as Prisma.InputJsonValue;
        patch.seoI18n = {
          ...seo,
          title: localized.seoTitle,
          description: localized.seoDescription,
          keywords: localized.seoKeywords,
        } as Prisma.InputJsonValue;
        patch.searchText = buildProductSearchText([
          ...Object.values(localized.title).map(String),
          ...Object.values(localized.description).map(String),
          p.material,
          p.fit,
          p.season,
          p.originCountry,
          ...(Array.isArray(patch.tags) ? patch.tags : p.tags),
          ...p.variants.map((v) => v.sku),
        ]);
        await tx.product.update({ where: { id: p.id }, data: patch });
        await tx.aiDraft.update({
          where: { id: draft.id },
          data: { status: "APPLIED", appliedHash: hash, appliedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            userId: actor,
            action: "ai.product.apply",
            entityType: "Product",
            entityId: p.id,
            after: { draftId: draft.id, fields: v.fields.map((f) => f.key) },
          },
        });
        return p.id;
      },
      { timeout: 15000 },
    ),
  );
}
export async function discardDraft(id: string) {
  const actor = await sessionActor();
  await aiAccess(actor, "ai.product.generate");
  return withMutation(() =>
    db.aiDraft.updateMany({
      where: {
        id: z.string().min(1).max(100).parse(id),
        userId: actor,
        status: "REVIEW",
      },
      data: { status: "DISCARDED" },
    }),
  );
}
