import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { getRequestContext } from "@/lib/request-context";
import { currentCustomer } from "@/modules/customers";
import {
  currentCatalogCutout,
  resolveCutoutPlacement,
} from "@/modules/catalog/cutouts/resolve";
import {
  storeCutoutModels,
  imageFingerprint,
} from "@/modules/catalog/cutouts/models";
import { validCompositionSlots } from "@/modules/catalog/cutouts/contracts";
import { lockMediaReferences } from "@/modules/media/reference-lock";
import { addSceneCartItems } from "@/modules/cart";
import { readConfig } from "./ledger";
import { FittingError } from "./contracts";
import { fittingProducts } from "./index";
import {
  instantSelectionSchema,
  instantSaveSchema,
  instantRowSchema,
  instantSnapshotSchema,
  type InstantSelection,
} from "./instant-contract";
type Locale = "fa" | "tr" | "en";
type Tx = Prisma.TransactionClient;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** Public references only. No wallet/session/provider access occurs here. */
export async function resolveInstantSelection(
  marketId: string,
  raw: unknown,
  tx: Tx = db,
) {
  const input = instantSelectionSchema.parse(raw);
  if (!(await readConfig(tx)).instantEnabled)
    throw new FittingError("DISABLED");
  const model = (await storeCutoutModels(tx)).find(
    (m) => m.id === input.modelId,
  );
  if (!model) throw new FittingError("INVALID_SELECTION");
  const layers = await Promise.all(
    input.variantIds.map((id) =>
      resolveCutoutPlacement(id, marketId, model.id, tx),
    ),
  );
  if (
    layers.some((v) => !v) ||
    !validCompositionSlots(layers.filter((v) => v !== null))
  )
    throw new FittingError("INVALID_COMBINATION");
  const revisions = await Promise.all(
    input.variantIds
      .slice()
      .sort()
      .map(async (variantId) => {
        const cutout = await currentCatalogCutout(variantId, marketId, tx);
        if (!cutout) throw new FittingError("INVALID_SELECTION");
        return {
          variantId,
          profileId: cutout.row.id,
          profileVersion: cutout.row.version,
          mediaId: cutout.row.mediaId,
          modelFingerprint: model.fingerprint,
          imageFingerprint: imageFingerprint(cutout.row.media),
        };
      }),
  );
  const fingerprint = hash({ marketId, modelId: model.id, revisions });
  return {
    model: {
      id: model.id,
      kind: model.kind,
      label: model.label,
      media: layers[0]!.model.media,
    },
    layers: layers.filter((v) => v !== null),
    snapshot: {
      version: 1 as const,
      modelId: model.id,
      variantIds: input.variantIds.slice().sort(),
      revisions,
      modelMediaId: model.mediaId,
      fingerprint,
    },
    fingerprint,
  };
}
/** Same lock order as catalog cutout writers; guards reference edits until commit. */
async function lockSelection(tx: Tx, selection: InstantSelection) {
  await tx.$queryRaw(
    Prisma.sql`SELECT p.id FROM "Product" p JOIN "Variant" v ON v."productId"=p.id WHERE v.id IN (${Prisma.join(selection.variantIds)}) ORDER BY p.id FOR SHARE OF p`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT c.id FROM "Category" c JOIN "Product" p ON p."categoryId"=c.id JOIN "Variant" v ON v."productId"=p.id WHERE v.id IN (${Prisma.join(selection.variantIds)}) ORDER BY c.id FOR SHARE OF c`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT s.id FROM "Size" s JOIN "Variant" v ON v."sizeId"=s.id WHERE v.id IN (${Prisma.join(selection.variantIds)}) ORDER BY s.id FOR SHARE OF s`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT c.id FROM "Color" c JOIN "Variant" v ON v."colorId"=c.id WHERE v.id IN (${Prisma.join(selection.variantIds)}) ORDER BY c.id FOR SHARE OF c`,
  );
  await tx.$queryRaw`SELECT id FROM "Integration" WHERE key='fitting-room' FOR SHARE`;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "Variant" WHERE id IN (${Prisma.join(selection.variantIds.slice().sort())}) ORDER BY id FOR SHARE`,
  );
}
async function actor() {
  const c = await currentCustomer();
  if (!c?.isActive || c.isGuest) throw new FittingError("LOGIN_REQUIRED");
  return c;
}
async function lockActor(tx: Tx, c: Awaited<ReturnType<typeof actor>>) {
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${c.id} FOR UPDATE`;
  const latest = await tx.customer.findUniqueOrThrow({ where: { id: c.id } });
  if (
    !latest.isActive ||
    latest.isGuest ||
    latest.sessionVersion !== c.sessionVersion
  )
    throw new FittingError("LOGIN_REQUIRED");
}
export async function saveInstantLook(locale: Locale, raw: unknown) {
  const input = instantSaveSchema.parse(raw),
    c = await actor(),
    { market } = await getRequestContext(locale);
  const replay = hash({
    name: input.name,
    modelId: input.modelId,
    variantIds: [...input.variantIds].sort(),
    fingerprint: input.fingerprint,
    marketId: market.id,
  });
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await lockSelection(tx, input);
      await lockActor(tx, c);
      const prior = await tx.customerInstantLook.findUnique({
        where: {
          customerId_requestKey: {
            customerId: c.id,
            requestKey: input.requestKey,
          },
        },
      });
      if (!input.id && prior) {
        if (
          prior.fingerprint !== replay ||
          prior.archivedAt ||
          prior.version !== 1
        )
          throw new FittingError("REQUEST_CONFLICT");
        return { id: prior.id, version: prior.version };
      }
      const resolved = await resolveInstantSelection(
        market.id,
        inputSelection(input),
        tx,
      );
      if (resolved.fingerprint !== input.fingerprint)
        throw new FittingError("STALE");
      await lockMediaReferences(
        tx,
        [
          resolved.snapshot.modelMediaId,
          ...resolved.snapshot.revisions.map((v) => v.mediaId),
        ],
        { readyImages: true },
      );
      // Re-resolve after media locks: a prior unlocked read cannot approve retired pixels.
      const pinned = await resolveInstantSelection(
        market.id,
        inputSelection(input),
        tx,
      );
      if (pinned.fingerprint !== input.fingerprint)
        throw new FittingError("STALE");
      if (input.id) {
        const row = await tx.customerInstantLook.findFirst({
          where: { id: input.id, customerId: c.id, marketId: market.id },
        });
        if (!row || row.archivedAt || row.version !== input.expectedVersion)
          throw new FittingError("STALE");
        const saved = await tx.customerInstantLook.update({
          where: { id: row.id },
          data: {
            name: input.name,
            snapshot: pinned.snapshot,
            version: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            action: "customer.instant.updated",
            entityType: "CustomerInstantLook",
            entityId: saved.id,
            after: {
              version: saved.version,
              piecesCount: input.variantIds.length,
            },
          },
        });
        return { id: saved.id, version: saved.version };
      }
      const saved = await tx.customerInstantLook.create({
        data: {
          customerId: c.id,
          marketId: market.id,
          requestKey: input.requestKey,
          fingerprint: replay,
          name: input.name,
          snapshot: pinned.snapshot,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "customer.instant.created",
          entityType: "CustomerInstantLook",
          entityId: saved.id,
          after: { piecesCount: input.variantIds.length },
        },
      });
      return { id: saved.id, version: saved.version };
    }),
  );
}
function inputSelection(v: InstantSelection): InstantSelection {
  return { modelId: v.modelId, variantIds: v.variantIds };
}
export async function mutateInstantLook(locale: Locale, raw: unknown) {
  const input = instantRowSchema.parse(raw),
    c = await actor(),
    { market } = await getRequestContext(locale);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await lockActor(tx, c);
      const row = await tx.customerInstantLook.findFirst({
        where: { id: input.id, customerId: c.id, marketId: market.id },
      });
      if (!row || row.version !== input.expectedVersion)
        throw new FittingError("STALE");
      if (input.operation === "delete")
        await tx.customerInstantLook.delete({ where: { id: row.id } });
      else
        await tx.customerInstantLook.update({
          where: { id: row.id },
          data: {
            archivedAt: input.operation === "archive" ? new Date() : null,
            version: { increment: 1 },
          },
        });
      await tx.auditLog.create({
        data: {
          action: `customer.instant.${input.operation}`,
          entityType: "CustomerInstantLook",
          entityId: row.id,
          after: { version: row.version + 1 },
        },
      });
      return {};
    }),
  );
}
export async function instantLooks(
  locale: Locale,
  archived = false,
  after?: string,
) {
  const c = await actor(),
    { market } = await getRequestContext(locale);
  return db.customerInstantLook.findMany({
    where: {
      customerId: c.id,
      marketId: market.id,
      archivedAt: archived ? { not: null } : null,
      ...(after ? { id: { gt: after } } : {}),
    },
    orderBy: { id: "asc" },
    take: 100,
    select: {
      id: true,
      name: true,
      snapshot: true,
      version: true,
      archivedAt: true,
    },
  });
}
export async function addInstantItems(locale: Locale, raw: unknown) {
  const input = instantSelectionSchema
    .extend({ fingerprint: instantSnapshotSchema.shape.fingerprint })
    .strict()
    .parse(raw);
  await addSceneCartItems(locale, input.variantIds, async (tx, marketId) => {
    await lockSelection(tx, input);
    const resolved = await resolveInstantSelection(
      marketId,
      inputSelection(input),
      tx,
    );
    await lockMediaReferences(
      tx,
      [
        resolved.snapshot.modelMediaId,
        ...resolved.snapshot.revisions.map((v) => v.mediaId),
      ],
      { readyImages: true },
    );
    if (
      (await resolveInstantSelection(marketId, inputSelection(input), tx))
        .fingerprint !== input.fingerprint
    )
      throw new FittingError("STALE");
  });
}
export async function instantCatalog(
  marketId: string,
  locale: Locale,
  query = "",
  page: Parameters<typeof fittingProducts>[5] = {},
) {
  if (!(await readConfig(db)).instantEnabled)
    throw new FittingError("DISABLED");
  return fittingProducts("", marketId, locale, query, false, page);
}
