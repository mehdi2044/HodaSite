import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { catalogText } from "@/modules/catalog/localized";
import { getDisplayPrice } from "@/modules/pricing";
import {
  requestSchema,
  FittingError,
  allocate,
  snapshotSchema,
  type FittingSnapshot,
  type Allocation,
} from "./contracts";
import {
  readConfig,
  lockWallet,
  allowances,
  usableGrants,
  settleDebt,
} from "./ledger";
export { creditPaidOrder, revokeReturnedCoins } from "./ledger";
export {
  fittingSettings,
  saveFittingSettings,
  grantFittingCoins,
  resolveFittingSession,
} from "./settings";
export { FittingError } from "./contracts";
export { registerFittingJobs } from "./worker";
export async function fittingConfig() {
  return readConfig(db);
}
export async function requireCustomer(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const c = await tx.customer.findUnique({ where: { id } });
  if (!c?.isActive || c.isGuest) throw new FittingError("LOGIN_REQUIRED");
  return c;
}
export async function walletView(customerId: string) {
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await requireCustomer(tx, customerId);
      await lockWallet(tx, customerId);
      const c = await readConfig(tx);
      if (c.enabled) await allowances(tx, customerId, c, new Date());
      await settleDebt(tx, customerId);
      const grants = await usableGrants(tx, customerId, new Date());
      const w = await tx.fittingWallet.findUniqueOrThrow({
        where: { customerId },
      });
      return {
        balance: grants
          .reduce((s, g) => s.add(g.balance.toString()), new Decimal(0))
          .toFixed(),
        debt: w.debt.toString(),
        dailyExpires:
          grants.find((g) => g.reason === "DAILY")?.expiresAt?.toISOString() ??
          null,
        entries: (
          await tx.fittingCoinEntry.findMany({
            where: { customerId },
            orderBy: { createdAt: "desc" },
            take: 30,
          })
        ).map((e) => ({
          id: e.id,
          amount: e.amount.toString(),
          reason: e.reason,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    }),
  );
}
const paidStates = [
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "PARTIALLY_REFUNDED",
  "RETURN_REQUESTED",
  "RETURNED",
] as const;
export async function ownedVariantIds(
  tx: Prisma.TransactionClient,
  customerId: string,
) {
  const rows = await tx.orderItem.findMany({
    where: {
      order: {
        customerId,
        paidAt: { not: null },
        status: { in: [...paidStates] },
      },
    },
    select: {
      variantId: true,
      quantity: true,
      productSnapshot: true,
      returnItems: {
        where: { returnRequest: { status: "RESOLVED" } },
        select: { quantity: true },
      },
    },
  });
  return new Set(
    rows
      .filter(
        (r) =>
          typeof (r.productSnapshot as Prisma.JsonObject).coinPackCoins !==
            "string" &&
          r.quantity > r.returnItems.reduce((n, i) => n + i.quantity, 0),
      )
      .map((r) => r.variantId),
  );
}
const variantInclude = {
  color: true,
  size: true,
  product: {
    include: {
      category: true,
      media: {
        include: { media: true },
        orderBy: { sortOrder: "asc" as const },
      },
    },
  },
  media: { include: { media: true }, orderBy: { sortOrder: "asc" as const } },
  stockItems: true,
} satisfies Prisma.VariantInclude;
export async function fittingProducts(
  customerId: string,
  marketId: string,
  locale: "fa" | "tr" | "en",
  query = "",
  owned = false,
) {
  const ownedIds = await ownedVariantIds(db, customerId);
  const rows = await db.variant.findMany({
    where: owned
      ? { id: { in: [...ownedIds] } }
      : {
          isActive: true,
          color: { deletedAt: null },
          size: { deletedAt: null },
          product: {
            deletedAt: null,
            status: "ACTIVE",
            coinPackCoins: null,
            marketIds: { has: marketId },
            category: { deletedAt: null },
            ...(query
              ? {
                  searchText: { contains: query, mode: "insensitive" as const },
                }
              : {}),
          },
        },
    include: variantInclude,
    orderBy: [{ productId: "asc" }, { id: "asc" }],
    take: 300,
  });
  const market = await db.market.findUniqueOrThrow({ where: { id: marketId } });
  const prices = new Map(
    await Promise.all(
      rows.map(
        async (v) =>
          [
            v.id,
            ownedIds.has(v.id)
              ? null
              : (await getDisplayPrice(v.product, v, market)).amount,
          ] as const,
      ),
    ),
  );
  return rows.flatMap((v) => {
    const m = [...v.media, ...v.product.media]
      .map((x) => x.media)
      .find(
        (x) =>
          x.status === "READY" && !x.deletedAt && x.mime.startsWith("image/"),
      );
    if (!m) return [];
    return [
      {
        variantId: v.id,
        productId: v.productId,
        title: catalogText(v.product.titleI18n, locale),
        color: catalogText(v.color.nameI18n, locale),
        hex: v.color.hex,
        size: v.size.value,
        gender: v.product.gender,
        slot: v.product.fittingSlot,
        url: m.url,
        amount: prices.get(v.id) ?? null,
        owned: ownedIds.has(v.id),
        available:
          v.stockItems.reduce((n, s) => n + s.onHand - s.reserved, 0) > 0,
      },
    ];
  });
}
export async function createFittingSession(
  customerId: string,
  marketId: string,
  locale: "fa" | "tr" | "en",
  raw: unknown,
) {
  const input = requestSchema.parse(raw);
  const normalized = {
    modelId: input.modelId,
    variantIds: [...input.variantIds].sort(),
    marketId,
    expectedCostCoins: input.expectedCostCoins,
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
  return withMutation(() =>
    db.$transaction(
      async (tx) => {
        await requireCustomer(tx, customerId);
        let c = await readConfig(tx);
        if (!c.enabled) throw new FittingError("DISABLED");
        // Shared dispatch cap and admin settings are serialized before the customer wallet.
        await tx.$queryRaw`SELECT id FROM "Integration" WHERE key='fitting-room' FOR UPDATE`;
        c = await readConfig(tx);
        if (!c.enabled) throw new FittingError("DISABLED");
        await lockWallet(tx, customerId);
        const old = await tx.fittingSession.findUnique({
          where: {
            customerId_requestKey: { customerId, requestKey: input.requestKey },
          },
        });
        if (old) {
          if (old.fingerprint !== fingerprint)
            throw new FittingError("REQUEST_CONFLICT");
          return { id: old.id, status: old.status };
        }
        if (!new Decimal(input.expectedCostCoins).eq(c.costCoins))
          throw new FittingError("CHARGE_CHANGED");
        const model = c.models.find((m) => m.id === input.modelId && m.enabled);
        if (!model) throw new FittingError("INVALID_SELECTION");
        const modelMedia = await tx.media.findFirst({
          where: {
            id: model.mediaId,
            deletedAt: null,
            status: "READY",
            mime: { startsWith: "image/" },
            kind: {
              notIn: ["receipt", "backup", "invoice", "expense", "review"],
            },
          },
        });
        if (!modelMedia) throw new FittingError("INVALID_SELECTION");
        if (!process.env.FITTING_OPENAI_API_KEY && !process.env.OPENAI_API_KEY)
          throw new FittingError("PROVIDER_UNAVAILABLE");
        const variants = await tx.variant.findMany({
          where: { id: { in: input.variantIds } },
          include: variantInclude,
        });
        const owned = await ownedVariantIds(tx, customerId);
        if (
          variants.length !== input.variantIds.length ||
          new Set(variants.map((v) => v.productId)).size !== variants.length
        )
          throw new FittingError("INVALID_SELECTION");
        const requiredGender =
          model.kind === "WOMAN"
            ? "WOMEN"
            : model.kind === "MAN"
              ? "MEN"
              : "KIDS";
        const slots = variants
          .map((v) => v.product.fittingSlot)
          .filter((s) => s && s !== "ACCESSORY");
        if (
          new Set(slots).size !== slots.length ||
          (slots.includes("ONE_PIECE") &&
            (slots.includes("TOP") || slots.includes("BOTTOM")))
        )
          throw new FittingError("INVALID_COMBINATION");
        const items = variants.map((v) => {
          const isOwned = owned.has(v.id);
          if (
            v.product.coinPackCoins ||
            (!isOwned &&
              (!v.isActive ||
                v.product.status !== "ACTIVE" ||
                v.product.deletedAt ||
                v.color.deletedAt ||
                v.size.deletedAt ||
                v.product.category.deletedAt ||
                !v.product.marketIds.includes(marketId) ||
                !v.stockItems.some((s) => s.onHand > s.reserved)))
          )
            throw new FittingError("INVALID_SELECTION");
          if (
            v.product.gender !== requiredGender &&
            v.product.gender !== "UNISEX"
          )
            throw new FittingError("INVALID_SELECTION");
          const image = [...v.media, ...v.product.media]
            .map((m) => m.media)
            .find(
              (m) =>
                m.status === "READY" &&
                !m.deletedAt &&
                m.mime.startsWith("image/"),
            );
          if (!image) throw new FittingError("INVALID_SELECTION");
          return {
            variantId: v.id,
            productId: v.productId,
            title: catalogText(v.product.titleI18n, locale),
            color: catalogText(v.color.nameI18n, locale),
            hex: v.color.hex,
            size: v.size.value,
            owned: isOwned,
            image: { storageKey: image.storageKey, mime: image.mime },
          };
        });
        const now = new Date(),
          day = await allowances(tx, customerId, c, now);
        const countWhere = {
          createdAt: { gte: day.start, lt: day.end },
          status: { not: "FAILED" },
        };
        const [userCount, globalCount] = await Promise.all([
          tx.fittingSession.count({ where: { ...countWhere, customerId } }),
          tx.fittingSession.count({
            where: { createdAt: countWhere.createdAt },
          }),
        ]);
        if (
          (c.dailyLimit > 0 && userCount >= c.dailyLimit) ||
          globalCount >= c.globalDailyLimit
        )
          throw new FittingError("DAILY_LIMIT");
        await settleDebt(tx, customerId, now);
        const wallet = await tx.fittingWallet.findUniqueOrThrow({
          where: { customerId },
        });
        if (wallet.debt.gt(0)) throw new FittingError("INSUFFICIENT_COINS");
        const grants = await usableGrants(tx, customerId, now);
        const allocations = allocate(c.costCoins, grants);
        for (const a of allocations)
          await tx.fittingCoinGrant.update({
            where: { id: a.grantId },
            data: { balance: { decrement: a.amount } },
          });
        const snapshot: FittingSnapshot = {
          model: {
            kind: model.kind,
            image: { storageKey: modelMedia.storageKey, mime: modelMedia.mime },
          },
          items,
          provider: "openai",
          modelName: c.model,
          quality: c.quality,
        };
        const session = await tx.fittingSession.create({
          data: {
            customerId,
            marketId,
            requestKey: input.requestKey,
            fingerprint,
            modelId: model.id,
            snapshot,
            allocations,
            costCoins: c.costCoins,
          },
        });
        await tx.fittingCoinEntry.create({
          data: {
            customerId,
            sourceKey: `spend:${session.id}`,
            amount: new Decimal(c.costCoins).neg().toFixed(),
            reason: "FITTING",
          },
        });
        await tx.job.create({
          data: { type: "fitting-render", payload: { sessionId: session.id } },
        });
        return { id: session.id, status: session.status };
      },
      { timeout: 30000 },
    ),
  );
}
export async function refundSession(
  tx: Prisma.TransactionClient,
  id: string,
  errorCode: string,
) {
  await tx.$queryRaw`SELECT id FROM "FittingSession" WHERE id=${id} FOR UPDATE`;
  const s = await tx.fittingSession.findUniqueOrThrow({ where: { id } });
  await lockWallet(tx, s.customerId);
  if (["FAILED", "DONE"].includes(s.status)) return;
  const allocations = s.allocations as Allocation[];
  for (const a of allocations) {
    const g = await tx.fittingCoinGrant.findUniqueOrThrow({
      where: { id: a.grantId },
    });
    const wallet = await tx.fittingWallet.findUniqueOrThrow({
      where: { customerId: s.customerId },
    });
    const offset = Decimal.min(a.amount, wallet.debt.toString());
    if (offset.gt(0))
      await tx.fittingWallet.update({
        where: { customerId: s.customerId },
        data: { debt: { decrement: offset.toFixed() } },
      });
    const credit = new Decimal(a.amount).sub(offset);
    const room = Decimal.max(
      0,
      new Decimal(g.amount.toString())
        .sub(g.revokedAmount.toString())
        .sub(g.balance.toString()),
    );
    const restored = Decimal.min(credit, room);
    if (restored.gt(0))
      await tx.fittingCoinGrant.update({
        where: { id: g.id },
        data: { balance: { increment: restored.toFixed() } },
      });
    const recovered = credit.sub(restored);
    // A revoked source can have been replaced by later paid grants that cleared its debt.
    // Restore that overpaid debt as a new compensating lot, retaining the original expiry.
    if (recovered.gt(0))
      await tx.fittingCoinGrant.create({
        data: {
          customerId: s.customerId,
          sourceKey: `recovery:${id}:${g.id}`,
          reason: "FAILED_RECOVERY",
          amount: recovered.toFixed(),
          balance: recovered.toFixed(),
          expiresAt: g.expiresAt,
        },
      });
  }
  await tx.fittingCoinEntry.create({
    data: {
      customerId: s.customerId,
      sourceKey: `refund:${id}`,
      amount: s.costCoins,
      reason: "FAILED_REFUND",
    },
  });
  await tx.fittingSession.update({
    where: { id },
    data: { status: "FAILED", errorCode, completedAt: new Date() },
  });
}
export async function sessionView(customerId: string, id: string) {
  await requireCustomer(db, customerId);
  const s = await db.fittingSession.findFirst({ where: { id, customerId } });
  if (!s) throw new FittingError("NOT_FOUND");
  return {
    id: s.id,
    status: s.status,
    costCoins: s.costCoins.toString(),
    snapshot: snapshotSchema.parse(s.snapshot),
    imageUrl: s.status === "DONE" ? `/api/fitting/${s.id}/image` : null,
    errorCode: s.errorCode,
    savedName: s.savedName,
  };
}
export async function saveLook(customerId: string, id: string, name: string) {
  if (!name.trim() || name.length > 120)
    throw new FittingError("INVALID_SELECTION");
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await requireCustomer(tx, customerId);
      const changed = await tx.fittingSession.updateMany({
        where: { id, customerId, status: "DONE" },
        data: { savedName: name.trim(), savedAt: new Date() },
      });
      if (!changed.count) throw new FittingError("NOT_FOUND");
    }),
  );
}
export async function savedLooks(customerId: string) {
  await requireCustomer(db, customerId);
  return (
    await db.fittingSession.findMany({
      where: { customerId, savedAt: { not: null }, status: "DONE" },
      orderBy: { savedAt: "desc" },
      take: 50,
    })
  ).map((s) => ({
    id: s.id,
    name: s.savedName,
    imageUrl: `/api/fitting/${s.id}/image`,
  }));
}
