import type { OrderStatus } from "@prisma/client";

const transitions: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: [
    "AWAITING_VERIFICATION",
    "PAID",
    "NEEDS_REVIEW",
    "CANCELLED",
  ],
  AWAITING_VERIFICATION: [
    "PENDING_PAYMENT",
    "PAID",
    "NEEDS_REVIEW",
    "CANCELLED",
  ],
  NEEDS_REVIEW: ["PAID", "PENDING_PAYMENT", "CANCELLED"],
  PAID: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
};
export class CommerceError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!transitions[from]?.includes(to))
    throw new CommerceError("INVALID_TRANSITION");
}
export function deadlinePassed(deadline: Date, now = new Date()) {
  return deadline.getTime() <= now.getTime();
}
