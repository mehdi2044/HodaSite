import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { seal, unseal } from "@/lib/secure-tokens";
import { ForbiddenError } from "@/modules/access";
import { admin, customer, activeMarket } from "./scope";
import {
  id,
  channelSchema,
  consentStatus,
  privacyKind,
  privacyStatus,
  validTransition,
} from "./contracts";

// Historical checkout address fields only; never return arbitrary snapshot JSON.
function exportAddress(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const fields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "country",
    "province",
    "city",
    "line1",
    "line2",
    "postalCode",
    "note",
    "birthDate",
    "gender",
  ];
  return Object.fromEntries(
    fields.flatMap((field) =>
      typeof value[field] === "string" ? [[field, value[field]]] : [],
    ),
  );
}

async function writeConsent(
  tx: Prisma.TransactionClient,
  customerId: string,
  marketId: string,
  channel: string,
  status: string,
  source: string,
  expectedVersion?: number,
) {
  // Customer row is the stable lock even on the very first consent insert.
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${customerId} FOR UPDATE`;
  const key = { customerId, marketId, channel };
  const previous = await tx.marketingConsent.findUnique({
    where: { customerId_marketId_channel: key },
  });
  if (expectedVersion !== undefined && previous?.version !== expectedVersion)
    throw new ForbiddenError("crm.customer.view");
  if (previous?.status === status) return previous;
  const row = await tx.marketingConsent.upsert({
    where: { customerId_marketId_channel: key },
    create: { ...key, status, source },
    update: { status, source, version: { increment: 1 } },
  });
  await tx.consentEvent.create({
    data: { ...key, status, source, actorId: customerId, version: row.version },
  });
  await tx.auditLog.create({
    data: {
      action: "crm.consent.changed",
      entityType: "MarketingConsent",
      entityId: row.id,
      after: { marketId, channel, status, source, version: row.version },
    },
  });
  return row;
}
export async function setPreference(raw: unknown) {
  const input = z
    .object({ marketId: id, channel: channelSchema, status: consentStatus })
    .strict()
    .parse(raw);
  const actor = await customer();
  await activeMarket(input.marketId);
  return withMutation(() =>
    db.$transaction((tx) =>
      writeConsent(
        tx,
        actor.id,
        input.marketId,
        input.channel,
        input.status,
        "PREFERENCE_CENTER",
      ),
    ),
  );
}
export async function preferences(marketId: string) {
  const actor = await customer();
  await activeMarket(marketId);
  return db.marketingConsent.findMany({
    where: { customerId: actor.id, marketId },
    select: { channel: true, status: true, source: true, updatedAt: true },
  });
}
// Future senders must recheck current consent at dispatch. Absence and legacy JSON never grant consent.
export async function hasMarketingConsent(
  customerId: string,
  marketId: string,
  channel: z.infer<typeof channelSchema>,
) {
  const row = await db.marketingConsent.findFirst({
    where: {
      customerId,
      marketId,
      channel,
      status: "OPTED_IN",
      customer: { isActive: true },
      market: { isActive: true },
    },
    select: { id: true },
  });
  return !!row;
}
const unsubscribeSchema = z
  .object({
    purpose: z.literal("crm-email-unsubscribe-v1"),
    customerId: id,
    marketId: id,
    version: z.number().int().positive(),
    expires: z.number().int(),
  })
  .strict();
export async function createUnsubscribeToken(marketId: string) {
  const actor = await customer();
  const consent = await db.marketingConsent.findUnique({
    where: {
      customerId_marketId_channel: {
        customerId: actor.id,
        marketId,
        channel: "email",
      },
    },
  });
  if (!consent || consent.status !== "OPTED_IN") return null;
  return seal({
    purpose: "crm-email-unsubscribe-v1",
    customerId: actor.id,
    marketId,
    version: consent.version,
    expires: Date.now() + 7 * 86400000,
  });
}
export function readUnsubscribeToken(token: unknown, now = Date.now()) {
  try {
    const data = unsubscribeSchema.parse(
      unseal(z.string().min(30).max(2048).parse(token)),
    );
    if (data.expires <= now || data.expires > now + 7 * 86400000)
      throw new Error();
    return data;
  } catch {
    throw new ForbiddenError("crm.customer.view");
  }
}
export async function unsubscribeEmail(token: unknown) {
  const data = readUnsubscribeToken(token);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      // POST only, purpose/expiry + consent version prevent an old link overriding a later opt-in.
      return writeConsent(
        tx,
        data.customerId,
        data.marketId,
        "email",
        "OPTED_OUT",
        "UNSUBSCRIBE_LINK",
        data.version,
      );
    }),
  );
}

export async function requestPrivacy(raw: unknown) {
  const input = z
    .object({ marketId: id, kind: privacyKind })
    .strict()
    .parse(raw);
  const actor = await customer();
  await activeMarket(input.marketId);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${actor.id} FOR UPDATE`;
      const prior = await tx.privacyRequest.findFirst({
        where: {
          customerId: actor.id,
          marketId: input.marketId,
          kind: input.kind,
          status: { in: ["REQUESTED", "IN_REVIEW"] },
        },
      });
      if (prior) return prior;
      const row = await tx.privacyRequest.create({
        data: {
          ...input,
          customerId: actor.id,
          events: {
            create: {
              status: "REQUESTED",
              actorId: actor.id,
              actorKind: "CUSTOMER",
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          action: "crm.privacy.requested",
          entityType: "PrivacyRequest",
          entityId: row.id,
          after: { marketId: input.marketId, kind: input.kind },
        },
      });
      return row;
    }),
  );
}
export async function privacyRequests(
  marketId: string,
  page = 0,
  administrative = false,
) {
  z.number().int().min(0).max(1000).parse(page);
  const customerId = administrative
    ? (await admin("crm.privacy.review", marketId), undefined)
    : (await customer()).id;
  return db.privacyRequest.findMany({
    where: { marketId, customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 26,
    skip: page * 25,
    include: {
      customer: { select: { firstName: true, lastName: true } },
      events: { orderBy: { createdAt: "asc" }, take: 10 },
    },
  });
}
export async function transitionPrivacy(raw: unknown, asCustomer = false) {
  const input = z
    .object({
      id,
      marketId: id,
      version: z.number().int().positive(),
      status: privacyStatus,
    })
    .strict()
    .parse(raw);
  const actorId = asCustomer
    ? (await customer()).id
    : await admin("crm.privacy.review", input.marketId);
  return withMutation(() =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PrivacyRequest" WHERE id=${input.id} FOR UPDATE`;
      const row = await tx.privacyRequest.findFirst({
        where: {
          id: input.id,
          marketId: input.marketId,
          ...(asCustomer ? { customerId: actorId } : {}),
        },
      });
      if (
        !row ||
        row.version !== input.version ||
        !validTransition(row.status, input.status, asCustomer)
      )
        throw new ForbiddenError("crm.privacy.review");
      if (!asCustomer && row.kind === "EXPORT" && input.status === "APPROVED")
        await admin("crm.customer.export", row.marketId);
      const result = await tx.privacyRequest.update({
        where: { id: row.id },
        data: {
          status: input.status,
          version: { increment: 1 },
          ...(!asCustomer ? { reviewedBy: actorId } : {}),
          events: {
            create: {
              actorId,
              actorKind: asCustomer ? "CUSTOMER" : "ADMIN",
              status: input.status,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: asCustomer ? null : actorId,
          action: "crm.privacy.reviewed",
          entityType: "PrivacyRequest",
          entityId: row.id,
          after: {
            status: input.status,
            version: result.version,
            marketId: row.marketId,
          },
        },
      });
      // APPROVED deletion is a reviewed request, never automatic fulfillment.
      return result;
    }),
  );
}
export async function exportPersonalData(requestId: string, page = 0) {
  id.parse(requestId);
  z.number().int().min(0).max(10000).parse(page);
  const actor = await customer();
  const request = await db.privacyRequest.findFirst({
    where: {
      id: requestId,
      customerId: actor.id,
      kind: "EXPORT",
      status: "APPROVED",
    },
  });
  if (!request) throw new ForbiddenError("crm.customer.export");
  const marketId = request.marketId;
  return db.$transaction(
    async (tx) => {
      const [
        orders,
        reviews,
        consents,
        requests,
        consentHistory,
        wishlist,
        carts,
        returns,
        addresses,
      ] = await Promise.all([
        tx.order.findMany({
          where: { customerId: actor.id, marketId },
          select: {
            number: true,
            status: true,
            totalAmount: true,
            currency: true,
            placedAt: true,
            shippingAddress: true,
            billingAddress: true,
          },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        tx.review.findMany({
          where: { customerId: actor.id, marketId },
          select: { rating: true, body: true, createdAt: true },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        tx.marketingConsent.findMany({
          where: { customerId: actor.id, marketId },
          select: {
            channel: true,
            status: true,
            source: true,
            updatedAt: true,
          },
        }),
        tx.privacyRequest.findMany({
          where: { customerId: actor.id, marketId },
          select: { kind: true, status: true, createdAt: true },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        tx.consentEvent.findMany({
          where: { customerId: actor.id, marketId },
          select: {
            channel: true,
            status: true,
            source: true,
            createdAt: true,
          },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        tx.wishlist.findMany({
          where: { customerId: actor.id, marketId },
          select: { productId: true, createdAt: true },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        tx.cart.findMany({
          where: { customerId: actor.id, marketId },
          select: {
            createdAt: true,
            updatedAt: true,
            completedAt: true,
            expiresAt: true,
            locale: true,
          },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        tx.returnRequest.findMany({
          where: { customerId: actor.id, order: { marketId } },
          select: {
            type: true,
            status: true,
            reasonCode: true,
            note: true,
            createdAt: true,
          },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
        // Address is the customer's global address book, not an Order's frozen
        // shipping/billing snapshot. It has no marketId; scope by session owner.
        tx.address.findMany({
          where: { customerId: actor.id },
          select: {
            label: true,
            country: true,
            province: true,
            city: true,
            line1: true,
            line2: true,
            postalCode: true,
            phone: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { id: "asc" },
          skip: page * 100,
          take: 101,
        }),
      ]);
      return {
        schemaVersion: 1,
        marketId,
        generatedAt: new Date().toISOString(),
        profile: {
          email: actor.email,
          firstName: actor.firstName,
          lastName: actor.lastName,
          phone: actor.phone,
          locale: actor.locale,
          birthDate: actor.birthDate,
          gender: actor.gender,
        },
        consents,
        orders: orders
          .slice(0, 100)
          .map(({ shippingAddress, billingAddress, ...order }) => ({
            ...order,
            shippingAddress: exportAddress(shippingAddress),
            billingAddress: exportAddress(billingAddress),
          })),
        reviews: reviews.slice(0, 100),
        requests: requests.slice(0, 100),
        consentHistory: consentHistory.slice(0, 100),
        wishlist: wishlist.slice(0, 100),
        carts: carts.slice(0, 100),
        returns: returns.slice(0, 100),
        addresses: addresses.slice(0, 100),
        pagination: {
          page,
          pageSize: 100,
          nextPage: [
            orders,
            reviews,
            requests,
            consentHistory,
            wishlist,
            carts,
            returns,
            addresses,
          ].some((xs) => xs.length > 100)
            ? page + 1
            : null,
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
