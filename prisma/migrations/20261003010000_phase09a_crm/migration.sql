-- CreateTable
CREATE TABLE "CrmProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingConsent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrivacyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSegment" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSegmentRevision" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmSegmentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmMetricsConfig" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CrmMetricsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmProfile_marketId_idx" ON "CrmProfile"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmProfile_customerId_marketId_key" ON "CrmProfile"("customerId", "marketId");

-- CreateIndex
CREATE INDEX "CrmNote_customerId_marketId_createdAt_idx" ON "CrmNote"("customerId", "marketId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmNote_marketId_idx" ON "CrmNote"("marketId");

-- CreateIndex
CREATE INDEX "MarketingConsent_marketId_channel_status_customerId_idx" ON "MarketingConsent"("marketId", "channel", "status", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingConsent_customerId_marketId_channel_key" ON "MarketingConsent"("customerId", "marketId", "channel");

-- CreateIndex
CREATE INDEX "ConsentEvent_customerId_marketId_createdAt_idx" ON "ConsentEvent"("customerId", "marketId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_marketId_idx" ON "ConsentEvent"("marketId");

-- CreateIndex
CREATE INDEX "PrivacyRequest_customerId_marketId_createdAt_idx" ON "PrivacyRequest"("customerId", "marketId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_marketId_status_idx" ON "PrivacyRequest"("marketId", "status");

-- CreateIndex
CREATE INDEX "PrivacyEvent_requestId_createdAt_idx" ON "PrivacyEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmSegment_marketId_createdAt_idx" ON "CrmSegment"("marketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSegmentRevision_segmentId_version_key" ON "CrmSegmentRevision"("segmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CrmMetricsConfig_marketId_key" ON "CrmMetricsConfig"("marketId");

-- AddForeignKey
ALTER TABLE "CrmProfile" ADD CONSTRAINT "CrmProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmProfile" ADD CONSTRAINT "CrmProfile_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyEvent" ADD CONSTRAINT "PrivacyEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSegment" ADD CONSTRAINT "CrmSegment_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSegmentRevision" ADD CONSTRAINT "CrmSegmentRevision_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CrmSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmMetricsConfig" ADD CONSTRAINT "CrmMetricsConfig_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D69: immutable consent/review/revision evidence. No existing records are changed.
CREATE FUNCTION crm_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CRM evidence is append-only'; END; $$;
CREATE TRIGGER consent_evidence_immutable BEFORE UPDATE OR DELETE ON "ConsentEvent" FOR EACH ROW EXECUTE FUNCTION crm_evidence_immutable();
CREATE TRIGGER privacy_evidence_immutable BEFORE UPDATE OR DELETE ON "PrivacyEvent" FOR EACH ROW EXECUTE FUNCTION crm_evidence_immutable();
CREATE TRIGGER segment_evidence_immutable BEFORE UPDATE OR DELETE ON "CrmSegmentRevision" FOR EACH ROW EXECUTE FUNCTION crm_evidence_immutable();
ALTER TABLE "MarketingConsent" ADD CONSTRAINT marketing_channel CHECK (channel IN ('email','sms','whatsapp','telegram','push')), ADD CONSTRAINT marketing_status CHECK (status IN ('OPTED_IN','OPTED_OUT')), ADD CONSTRAINT marketing_version CHECK (version > 0);
ALTER TABLE "ConsentEvent" ADD CONSTRAINT consent_event_channel CHECK (channel IN ('email','sms','whatsapp','telegram','push')), ADD CONSTRAINT consent_event_status CHECK (status IN ('OPTED_IN','OPTED_OUT'));
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT privacy_kind CHECK (kind IN ('EXPORT','DELETE')), ADD CONSTRAINT privacy_status CHECK (status IN ('REQUESTED','IN_REVIEW','APPROVED','REJECTED','CANCELLED')), ADD CONSTRAINT privacy_version CHECK (version > 0);
CREATE INDEX "Customer_preferredMarketId_id_idx" ON "Customer" ("preferredMarketId",id);
CREATE INDEX "Order_marketId_customerId_paidAt_idx" ON "Order" ("marketId","customerId","paidAt");
CREATE INDEX "CrmProfile_tags_gin" ON "CrmProfile" USING gin(tags);
CREATE UNIQUE INDEX "ConsentEvent_customerId_marketId_channel_version_key" ON "ConsentEvent"("customerId","marketId",channel,version);
