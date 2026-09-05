-- Phase 01a: Markets, Site Settings, Maintenance, Theme (additive only)

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN "legal" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ThemeSettings" ADD COLUMN "emailLogoMediaId" TEXT;
ALTER TABLE "ThemeSettings" ADD COLUMN "darkMode" TEXT NOT NULL DEFAULT 'off';
ALTER TABLE "ThemeSettings" ADD COLUMN "headerStyle" TEXT NOT NULL DEFAULT 'minimal';
ALTER TABLE "ThemeSettings" ADD COLUMN "buttonStyle" TEXT NOT NULL DEFAULT 'pill';

-- AlterTable
ALTER TABLE "Market" ADD COLUMN "announcementBar" JSONB NOT NULL DEFAULT '{"enabled":false}';
