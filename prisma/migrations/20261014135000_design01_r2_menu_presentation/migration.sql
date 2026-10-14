-- D77: additive presentation only; legacy menus keep their current behavior.
ALTER TABLE "MenuItem" ADD COLUMN "presentation" JSONB;
