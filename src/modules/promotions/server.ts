// Server-only service entry point; the offline evaluator index stays DB-free.
// Trusted server facade; identity and prices must be supplied by authorized callers.
export {
  savePromotionProgram,
  listPromotionPrograms,
  issuePromotionCoupons,
  setPromotionCouponStatus,
} from "./persistence";
export { simulatePromotionCart } from "./simulator";
