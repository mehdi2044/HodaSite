-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "media" JSONB NOT NULL DEFAULT '{"purgeRetentionDays":30}';
