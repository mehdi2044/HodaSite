-- CreateEnum
CREATE TYPE "ShippingLegType" AS ENUM ('INTERNATIONAL', 'DOMESTIC');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ShippingWorkflow" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "nameI18n" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShippingWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingLegTemplate" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "ShippingLegType" NOT NULL,
    "labelI18n" JSONB NOT NULL,
    "carrierName" TEXT NOT NULL DEFAULT '',
    "trackingUrlTemplate" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShippingLegTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nameI18n" JSONB NOT NULL,
    "status" "ShippingStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLeg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "ShippingLegType" NOT NULL,
    "labelI18n" JSONB NOT NULL,
    "carrierName" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL DEFAULT '',
    "trackingNumber" TEXT NOT NULL DEFAULT '',
    "trackingUrlTemplate" TEXT NOT NULL DEFAULT '',
    "costAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costCurrency" TEXT NOT NULL,
    "status" "ShippingStatus" NOT NULL DEFAULT 'PENDING',
    "shippedAt" TIMESTAMPTZ(3),
    "eta" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ShippingStatus" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingWorkflow_marketId_isActive_idx" ON "ShippingWorkflow"("marketId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingLegTemplate_workflowId_sortOrder_key" ON "ShippingLegTemplate"("workflowId", "sortOrder");

-- CreateIndex
CREATE INDEX "Shipment_orderId_status_idx" ON "Shipment"("orderId", "status");

-- CreateIndex
CREATE INDEX "ShipmentItem_orderItemId_idx" ON "ShipmentItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_orderItemId_key" ON "ShipmentItem"("shipmentId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentLeg_shipmentId_sortOrder_key" ON "ShipmentLeg"("shipmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrackingEvent_legId_at_idx" ON "TrackingEvent"("legId", "at");

-- AddForeignKey
ALTER TABLE "ShippingWorkflow" ADD CONSTRAINT "ShippingWorkflow_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingLegTemplate" ADD CONSTRAINT "ShippingLegTemplate_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ShippingWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ShippingWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ShipmentLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One active default per market; runtime also requires one before demotion.
CREATE UNIQUE INDEX "ShippingWorkflow_one_default" ON "ShippingWorkflow"("marketId") WHERE "isDefault";
ALTER TABLE "ShippingWorkflow" ADD CONSTRAINT "ShippingWorkflow_default_active" CHECK (NOT "isDefault" OR "isActive");
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_positive" CHECK (quantity > 0);
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_cost_nonnegative" CHECK ("costAmount" >= 0);
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_date_order" CHECK ("deliveredAt" IS NULL OR ("shippedAt" IS NOT NULL AND "deliveredAt" >= "shippedAt"));
CREATE FUNCTION phase05_shipping_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_id text; original_order text; ordered integer; used bigint;
BEGIN
 SELECT "orderId" INTO order_id FROM "Shipment" WHERE id=NEW."shipmentId";
 PERFORM id FROM "Order" WHERE id=order_id FOR UPDATE;
 SELECT "orderId", quantity INTO original_order, ordered FROM "OrderItem" WHERE id=NEW."orderItemId";
 IF original_order IS DISTINCT FROM order_id THEN RAISE EXCEPTION 'Shipment item belongs to another order'; END IF;
 SELECT COALESCE(SUM(i.quantity),0) INTO used FROM "ShipmentItem" i JOIN "Shipment" s ON s.id=i."shipmentId" WHERE i."orderItemId"=NEW."orderItemId" AND s.status <> 'CANCELLED';
 IF used+NEW.quantity>ordered THEN RAISE EXCEPTION 'Shipment allocation exceeds ordered quantity'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ShipmentItem_allocation" BEFORE INSERT ON "ShipmentItem" FOR EACH ROW EXECUTE FUNCTION phase05_shipping_allocation();
CREATE FUNCTION phase05_shipping_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Shipping allocation and tracking history are append-only'; END $$;
CREATE TRIGGER "ShipmentItem_append_only" BEFORE UPDATE OR DELETE ON "ShipmentItem" FOR EACH ROW EXECUTE FUNCTION phase05_shipping_append_only();
CREATE TRIGGER "TrackingEvent_append_only" BEFORE UPDATE OR DELETE ON "TrackingEvent" FOR EACH ROW EXECUTE FUNCTION phase05_shipping_append_only();
-- Initial editable configuration. Existing markets get routes without re-seeding.
INSERT INTO "ShippingWorkflow" (id,"marketId","nameI18n","isDefault","isActive",version,"updatedAt")
SELECT 'shipping-default-'||id,id,'{"fa":"ارسال استاندارد","tr":"Standart teslimat","en":"Standard delivery"}',true,true,0,now() FROM "Market" WHERE code IN ('TR','IR','CA');
INSERT INTO "ShippingLegTemplate" (id,"workflowId","sortOrder",type,"labelI18n","updatedAt")
SELECT 'shipping-default-'||id||'-1','shipping-default-'||id,0,CASE WHEN code='TR' THEN 'DOMESTIC'::"ShippingLegType" ELSE 'INTERNATIONAL'::"ShippingLegType" END,
CASE WHEN code='TR' THEN '{"fa":"ارسال داخلی","tr":"Yurt içi teslimat","en":"Domestic delivery"}'::jsonb ELSE '{"fa":"ارسال بین‌المللی","tr":"Uluslararası teslimat","en":"International delivery"}'::jsonb END,now() FROM "Market" WHERE code IN ('TR','IR','CA');
INSERT INTO "ShippingLegTemplate" (id,"workflowId","sortOrder",type,"labelI18n","updatedAt")
SELECT 'shipping-default-'||id||'-2','shipping-default-'||id,1,'DOMESTIC','{"fa":"ارسال داخلی","tr":"Yurt içi teslimat","en":"Domestic delivery"}',now() FROM "Market" WHERE code IN ('IR','CA');
INSERT INTO "ShippingWorkflow" (id,"marketId","nameI18n","isDefault","isActive",version,"updatedAt")
SELECT 'shipping-door-'||id,id,'{"fa":"درب تا درب","tr":"Kapıdan kapıya","en":"Door-to-door"}',false,true,0,now() FROM "Market" WHERE code='CA';
INSERT INTO "ShippingLegTemplate" (id,"workflowId","sortOrder",type,"labelI18n","updatedAt")
SELECT 'shipping-door-'||id||'-1','shipping-door-'||id,0,'INTERNATIONAL','{"fa":"درب تا درب","tr":"Kapıdan kapıya","en":"Door-to-door"}',now() FROM "Market" WHERE code='CA';
INSERT INTO "RolePermission" (id,"roleId",permission,"updatedAt")
SELECT 'shipping-grant-'||r.id||'-'||p.permission,r.id,p.permission,now() FROM "Role" r CROSS JOIN (VALUES ('order.shipment.manage'),('shipping.workflow.manage')) p(permission)
WHERE (r.key='admin' OR (r.key='warehouse' AND p.permission='order.shipment.manage'))
ON CONFLICT ("roleId",permission) DO NOTHING;
