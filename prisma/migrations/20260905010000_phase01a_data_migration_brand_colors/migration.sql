-- Phase 01a PR review (P1): Phase 00 shipped `SiteSettings.brand` as a flat
-- {fa,tr,en} object and `ThemeSettings.colors` as a flat palette. Phase 01a's
-- readers expect brand = {name:{fa,tr,en}, tagline:{fa,tr,en}} and
-- colors = {light:{...}, dark:{...}}. The earlier additive migration only
-- added columns, so an installation upgraded straight through would silently
-- fall back to defaults on read, and lose the old values the moment an admin
-- resaved either form. This is a one-time data migration, not a schema
-- change — idempotent (a database already on the new shape is untouched).

-- SiteSettings.brand: {fa,tr,en} -> {name:{fa,tr,en}, tagline:{fa,tr,en}}
UPDATE "SiteSettings"
SET "brand" = jsonb_build_object(
  'name', "brand",
  'tagline', jsonb_build_object('fa', '', 'tr', '', 'en', '')
)
WHERE NOT ("brand" ? 'name');

-- ThemeSettings.colors: flat palette -> {light: <old palette>, dark: <default dark palette>}
-- (matches src/lib/theme-defaults.ts DEFAULT_DARK_COLORS — no per-installation
-- "derived" dark palette exists to compute from, so this is the same default
-- new installs get; an admin can still repaint dark mode afterward.)
UPDATE "ThemeSettings"
SET "colors" = jsonb_build_object(
  'light', "colors",
  'dark', jsonb_build_object(
    'primary', '#F0955A',
    'background', '#171310',
    'surface', '#221C17',
    'text', '#F5F1EA',
    'muted', '#B5AA9C',
    'success', '#4FAF77',
    'error', '#E06655',
    'warning', '#D9A441'
  )
)
WHERE NOT ("colors" ? 'light');
