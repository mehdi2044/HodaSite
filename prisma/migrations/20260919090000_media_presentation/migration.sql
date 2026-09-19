-- Additive display metadata; original images and commerce records are unchanged.
ALTER TABLE "Media" ADD COLUMN "presentation" JSONB NOT NULL DEFAULT '{}';
