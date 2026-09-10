-- Preserve configured Phase 02 rates on upgrades; do not run demo seed in production.
-- The previous migration disabled the integration, but its config still exists.
INSERT INTO "FxQuote" ("id", "marketId", "baseCurrency", "quoteCurrency", "rate", "provider", "status", "acceptedAt", "fetchedAt")
SELECT 'legacy-phase02-' || m."id", m."id", 'USD', m."currency",
       (i."config" ->> m."code")::numeric(18,8), 'phase02-migration', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Market" m CROSS JOIN "Integration" i
WHERE i."key" = 'pricing.phase02-test-rates'
  AND CASE WHEN (i."config" ->> m."code") ~ '^\d{1,10}(\.\d{1,8})?$'
      THEN (i."config" ->> m."code")::numeric > 0 ELSE false END
  AND NOT EXISTS (SELECT 1 FROM "FxQuote" q WHERE q."marketId" = m."id" AND q."status" = 'ACTIVE')
ON CONFLICT DO NOTHING;
