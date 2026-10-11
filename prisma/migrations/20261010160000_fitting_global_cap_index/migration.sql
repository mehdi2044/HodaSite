-- The global daily cap counts every session in the current day, across customers
-- and statuses. Keep that range scan bounded as historical sessions accumulate.
CREATE INDEX "FittingSession_createdAt_idx" ON "FittingSession"("createdAt");
