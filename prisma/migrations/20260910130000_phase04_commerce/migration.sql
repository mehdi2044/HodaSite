-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'AWAITING_VERIFICATION', 'NEEDS_REVIEW', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'RETURN_REQUESTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOIDED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('SALE', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "ReturnedItemCondition" AS ENUM ('RESTOCK', 'QUARANTINE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED', 'RESOLVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orderViews" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "paymentMethods" TEXT[] DEFAULT ARRAY['OFFLINE_BANK_TRANSFER']::TEXT[];

-- AlterTable
ALTER TABLE "FeeRule" ADD COLUMN     "selectable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "orderId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "preferredMarketId" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "birthDate" TIMESTAMPTZ(3),
    "gender" TEXT,
    "marketingConsent" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "deletionRequestedAt" TIMESTAMPTZ(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "linkHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketBankAccount" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "cardNumber" TEXT NOT NULL DEFAULT '',
    "instructionsI18n" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" TEXT,
    "marketId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "checkout" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSequence" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 100000,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "guestTokenHash" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "locale" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotalAmount" DECIMAL(18,4) NOT NULL,
    "feeTotalAmount" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "totalAmountTry" DECIMAL(18,4) NOT NULL,
    "totalAmountUsd" DECIMAL(18,4) NOT NULL,
    "fxSnapshot" JSONB NOT NULL,
    "bankSnapshot" JSONB NOT NULL,
    "contactSnapshot" JSONB NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paymentDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "billingAddress" JSONB NOT NULL,
    "customerNote" TEXT NOT NULL DEFAULT '',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "placedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(3),
    "shippedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "parentOrderId" TEXT,
    "kind" "OrderKind" NOT NULL DEFAULT 'SALE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "unitPriceAmount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalAmount" DECIMAL(18,4) NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "exchangeOfOrderItemId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFee" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "FeeType" NOT NULL,
    "label" TEXT NOT NULL,
    "ruleId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "absorbed" BOOLEAN NOT NULL,
    "ruleSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "note" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'offline',
    "method" TEXT NOT NULL DEFAULT 'OFFLINE_BANK_TRANSFER',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMPTZ(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "resolution" TEXT,
    "refundId" TEXT,
    "exchangeOrderId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" "ReturnedItemCondition" NOT NULL,
    "exchangeVariantId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCredit" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "balance" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "sourceReturnId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthOtp_linkHash_key" ON "AuthOtp"("linkHash");

-- CreateIndex
CREATE INDEX "AuthOtp_email_createdAt_idx" ON "AuthOtp"("email", "createdAt");

-- CreateIndex
CREATE INDEX "MarketBankAccount_marketId_idx" ON "MarketBankAccount"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_tokenHash_key" ON "Cart"("tokenHash");

-- CreateIndex
CREATE INDEX "Cart_customerId_marketId_idx" ON "Cart"("customerId", "marketId");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_cartId_key" ON "Order"("cartId");

-- CreateIndex
CREATE INDEX "Order_marketId_status_idx" ON "Order"("marketId", "status");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_parentOrderId_idx" ON "Order"("parentOrderId");

-- CreateIndex
CREATE INDEX "Order_status_paymentDeadlineAt_idx" ON "Order"("status", "paymentDeadlineAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "OrderItem_exchangeOfOrderItemId_idx" ON "OrderItem"("exchangeOfOrderItemId");

-- CreateIndex
CREATE INDEX "OrderFee_orderId_idx" ON "OrderFee"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE INDEX "Payment_bankAccountId_idx" ON "Payment"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_mediaId_key" ON "Receipt"("mediaId");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId");

-- CreateIndex
CREATE INDEX "ReturnItem_returnRequestId_idx" ON "ReturnItem"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");

-- CreateIndex
CREATE INDEX "StoreCredit_customerId_idx" ON "StoreCredit"("customerId");

-- CreateIndex
CREATE INDEX "StoreCredit_sourceReturnId_idx" ON "StoreCredit"("sourceReturnId");

-- CreateIndex
CREATE INDEX "Reservation_orderId_status_idx" ON "Reservation"("orderId", "status");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketBankAccount" ADD CONSTRAINT "MarketBankAccount_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSequence" ADD CONSTRAINT "OrderSequence_id_fkey" FOREIGN KEY ("id") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_exchangeOfOrderItemId_fkey" FOREIGN KEY ("exchangeOfOrderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFee" ADD CONSTRAINT "OrderFee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "MarketBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_sourceReturnId_fkey" FOREIGN KEY ("sourceReturnId") REFERENCES "ReturnRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial records are retained; amounts and their snapshot inputs never change.
CREATE FUNCTION phase04_protect_financial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% is retained (D24)', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME IN ('OrderItem','OrderFee','Receipt','OrderEvent') THEN
    RAISE EXCEPTION '% is append-only (D24)', TG_TABLE_NAME;
  ELSIF TG_TABLE_NAME = 'Order' THEN
    IF (to_jsonb(NEW) - ARRAY['status','holdExpiresAt','shippingAddress','adminNote','paidAt','shippedAt','deliveredAt','cancelledAt','cancelReason','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','holdExpiresAt','shippingAddress','adminNote','paidAt','shippedAt','deliveredAt','cancelledAt','cancelReason','updatedAt'])
    THEN RAISE EXCEPTION 'Order financial snapshots are immutable (D07/D24)'; END IF;
  ELSIF TG_TABLE_NAME = 'Payment' THEN
    IF (to_jsonb(NEW) - ARRAY['status','reference','submittedAt','reviewedBy','reviewedAt','rejectReason','updatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reference','submittedAt','reviewedBy','reviewedAt','rejectReason','updatedAt'])
    THEN RAISE EXCEPTION 'Payment amounts are immutable (D24)'; END IF;
  ELSIF TG_TABLE_NAME = 'Refund' THEN
    IF (to_jsonb(NEW) - ARRAY['status','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updatedAt'])
    THEN RAISE EXCEPTION 'Refund amounts are immutable (D24)'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_order_financial BEFORE UPDATE OR DELETE ON "Order" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
CREATE TRIGGER protect_order_item BEFORE UPDATE OR DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
CREATE TRIGGER protect_order_fee BEFORE UPDATE OR DELETE ON "OrderFee" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
CREATE TRIGGER protect_order_event BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
CREATE TRIGGER protect_payment_financial BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
CREATE TRIGGER protect_receipt BEFORE UPDATE OR DELETE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
CREATE TRIGGER protect_refund_financial BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION phase04_protect_financial();
ALTER TABLE "Order" ADD CONSTRAINT "order_total_nonnegative" CHECK ("totalAmount">=0 AND "subtotalAmount">=0 AND "discountAmount">=0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_nonnegative" CHECK (amount>=0);
ALTER TABLE "CartItem" ADD CONSTRAINT "cart_quantity_positive" CHECK (quantity>0 AND quantity<=100);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_positive" CHECK (quantity>0 AND "unitPriceAmount">=0 AND "lineTotalAmount">=0);
ALTER TABLE "ReturnItem" ADD CONSTRAINT "return_quantity_positive" CHECK (quantity>0);
ALTER TABLE "StoreCredit" ADD CONSTRAINT "credit_balance_valid" CHECK (amount>=0 AND balance>=0 AND balance<=amount);
CREATE UNIQUE INDEX "one_approved_payment_per_order" ON "Payment"("orderId") WHERE status='APPROVED';
CREATE UNIQUE INDEX "one_submitted_payment_per_order" ON "Payment"("orderId") WHERE status='SUBMITTED';

-- Extend editable email templates on upgrades, including installations without demo seed.
UPDATE "NotificationTemplate" SET "bodyI18n" = jsonb_build_object(
 'fa',COALESCE("bodyI18n"->>'fa','') || E'\nلینک ورود: {{loginUrl}}',
 'tr',COALESCE("bodyI18n"->>'tr','') || E'\nGiriş bağlantısı: {{loginUrl}}',
 'en',COALESCE("bodyI18n"->>'en','') || E'\nSign-in link: {{loginUrl}}'
) WHERE key='auth.otp' AND channel='email' AND "bodyI18n"::text NOT LIKE '%loginUrl%';
UPDATE "NotificationTemplate" SET "bodyI18n" = jsonb_build_object(
 'fa',COALESCE("bodyI18n"->>'fa','') || E'\nرزرو موجودی تا {{holdUntil}}؛ مهلت پرداخت تا {{deadline}}. پس از پایان رزرو، تأیید پرداخت به موجودی وابسته است.\n{{bankDetails}}\n{{paymentUrl}}',
 'tr',COALESCE("bodyI18n"->>'tr','') || E'\nStok rezervasyonu: {{holdUntil}}; ödeme son tarihi: {{deadline}}. Rezervasyon sonrası onay stok durumuna bağlıdır.\n{{bankDetails}}\n{{paymentUrl}}',
 'en',COALESCE("bodyI18n"->>'en','') || E'\nStock held until {{holdUntil}}; payment deadline {{deadline}}. After the hold expires, approval depends on stock availability.\n{{bankDetails}}\n{{paymentUrl}}'
) WHERE key='order.placed' AND channel='email' AND "bodyI18n"::text NOT LIKE '%paymentUrl%';

-- A receipt is evidence: generic media operations must never replace or purge it.
CREATE FUNCTION phase04_protect_receipt_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind = 'receipt' OR EXISTS (SELECT 1 FROM "Receipt" WHERE "mediaId" = OLD.id) THEN
  RAISE EXCEPTION 'Financial receipt media is immutable';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_media_immutable BEFORE UPDATE OR DELETE ON "Media"
FOR EACH ROW EXECUTE FUNCTION phase04_protect_receipt_media();
