-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "style" TEXT NOT NULL,
    "forbiddenClaims" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(18,4) NOT NULL,
    "reservedUsd" DECIMAL(18,4) NOT NULL,
    "pricing" JSONB NOT NULL,
    "errorCode" TEXT,
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "id" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "marketId" TEXT,
    "productVersion" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "facts" JSONB NOT NULL,
    "proposal" JSONB NOT NULL,
    "appliedHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_feature_version_key" ON "PromptVersion"("feature", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_requestKey_key" ON "AiUsage"("requestKey");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_status_idx" ON "AiUsage"("createdAt", "status");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_marketId_createdAt_idx" ON "AiUsage"("marketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiDraft_requestKey_key" ON "AiDraft"("requestKey");

-- CreateIndex
CREATE INDEX "AiDraft_userId_status_createdAt_idx" ON "AiDraft"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiDraft_productId_idx" ON "AiDraft"("productId");


ALTER TABLE "PromptVersion" ADD FOREIGN KEY ("createdBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AiUsage" ADD FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AiUsage" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "AiUsage" ADD FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"(id) ON DELETE RESTRICT;
ALTER TABLE "AiDraft" ADD FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AiDraft" ADD FOREIGN KEY ("marketId") REFERENCES "Market"(id) ON DELETE RESTRICT;
ALTER TABLE "AiDraft" ADD FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE RESTRICT;
ALTER TABLE "PromptVersion" ADD CHECK (version > 0 AND feature IN ('product','finance'));
ALTER TABLE "AiUsage" ADD CHECK ("costUsd">=0 AND "reservedUsd">=0 AND ("inputTokens" IS NULL OR "inputTokens">=0) AND ("outputTokens" IS NULL OR "outputTokens">=0) AND status IN ('PENDING','SUCCEEDED','FAILED','CACHED'));
ALTER TABLE "AiDraft" ADD CHECK (status IN ('REVIEW','APPLIED','DISCARDED'));
CREATE TRIGGER immutable_prompt_version BEFORE UPDATE OR DELETE ON "PromptVersion" FOR EACH ROW EXECUTE FUNCTION immutable_finance_attribution();
CREATE FUNCTION protect_ai_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'PENDING' THEN RAISE EXCEPTION 'AI_USAGE_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','inputTokens','outputTokens','costUsd','errorCode','result','completedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','inputTokens','outputTokens','costUsd','errorCode','result','completedAt']) THEN RAISE EXCEPTION 'AI_USAGE_EVIDENCE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_ai_usage BEFORE UPDATE OR DELETE ON "AiUsage" FOR EACH ROW EXECUTE FUNCTION protect_ai_usage();
INSERT INTO "RolePermission" (id,"roleId",permission,"updatedAt") SELECT 'phase07_'||r.id||'_'||p.permission,r.id,p.permission,NOW() FROM "Role" r CROSS JOIN (VALUES('ai.product.generate')) p(permission) WHERE r.key='data_entry' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" (id,"roleId",permission,"updatedAt") SELECT 'phase07_'||r.id||'_'||p.permission,r.id,p.permission,NOW() FROM "Role" r CROSS JOIN (VALUES('ai.finance.analyze'),('ai.usage.view')) p(permission) WHERE r.key='accountant' ON CONFLICT DO NOTHING;
