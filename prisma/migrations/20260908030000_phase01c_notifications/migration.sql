-- Phase 01c: notification template authoring foundation (additive only).
CREATE TABLE "NotificationTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "subjectI18n" JSONB NOT NULL,
  "bodyI18n" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationTemplate_key_channel_key"
  ON "NotificationTemplate"("key", "channel");
CREATE INDEX "NotificationTemplate_channel_isActive_idx"
  ON "NotificationTemplate"("channel", "isActive");
