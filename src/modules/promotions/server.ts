// Server-only service entry point; the offline evaluator index stays DB-free.
// No Server Action/public endpoint exists in this persistence increment.
export {
  savePromotionProgram,
  listPromotionPrograms,
  issuePromotionCoupons,
  setPromotionCouponStatus,
} from "./persistence";
export { simulatePromotionCart } from "./simulator";
