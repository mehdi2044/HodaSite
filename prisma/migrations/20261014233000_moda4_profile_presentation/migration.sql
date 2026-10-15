-- Additive only: existing customers/themes retain NULL and original behavior.
ALTER TABLE "Customer" ADD COLUMN "profileTheme" TEXT,
  ADD COLUMN "stylePreferences" JSONB,
  ADD COLUMN "presentationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_presentation_version_nonnegative"
  CHECK ("presentationVersion" >= 0);
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_profile_theme_allowed"
  CHECK ("profileTheme" IS NULL OR "profileTheme" IN ('ROSE','SLATE','SAND'));
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_style_preferences_v1"
  CHECK ("stylePreferences" IS NULL OR (
    jsonb_typeof("stylePreferences") = 'object'
    AND "stylePreferences"->'version' = '1'::jsonb
    AND jsonb_typeof("stylePreferences"->'sizeIds') = 'array'
    AND jsonb_typeof("stylePreferences"->'categoryIds') = 'array'
    AND jsonb_array_length("stylePreferences"->'sizeIds') <= 20
    AND jsonb_array_length("stylePreferences"->'categoryIds') <= 20
  ) IS TRUE);
ALTER TABLE "ThemeSettings" ADD COLUMN "accountMediaId" TEXT;
