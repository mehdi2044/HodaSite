#!/usr/bin/env bash
# Backup database + media (D23, v1.1.2). Runs inside the `ops` container. Max finalizes in Phase 00 (keep CLI contract).
# Usage: backup.sh [--label TEXT] [--no-media] [--kind manual|scheduled|safety]
# Exit 0 = local backup OK (off-site status is recorded separately: OK | FAILED | NOT_CONFIGURED, never silent).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
LABEL="manual"; WITH_MEDIA=1; BACKUP_KIND="${BACKUP_KIND:-manual}"
while [[ $# -gt 0 ]]; do case "$1" in
  --label) LABEL="$2"; shift 2;; --no-media) WITH_MEDIA=0; shift;; --kind) BACKUP_KIND="$2"; shift 2;; *) echo "unknown arg $1"; exit 1;; esac; done

: "${DATABASE_URL:?DATABASE_URL required}"; : "${PROJECT_ID:?PROJECT_ID required}"
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"; MEDIA_DIR="${MEDIA_DIR:-/data/media}"
LABEL="$(sanitize_label "$LABEL")"; case "$BACKUP_KIND" in manual|scheduled|safety) ;; *) echo "bad kind"; exit 1;; esac
STAMP="$(date -u +%Y-%m-%d_%H%M)"; DIR="$BACKUP_ROOT/${STAMP}_${LABEL}"; mkdir -p "$DIR"
q(){ psql "$DATABASE_URL" -Atc "$1"; }
log(){ echo "[backup][$(date -u +%T)] $*"; }

log "db → $DIR/db.dump"
pg_dump --format=custom --compress=6 --no-owner --no-privileges "$DATABASE_URL" > "$DIR/db.dump"

MEDIA_COUNT=0
if [[ $WITH_MEDIA -eq 1 && -d "$MEDIA_DIR" ]]; then
  log "media → $DIR/media.tar.zst"
  # --no-recursion-free, deterministic, no symlinks followed
  tar -C "$MEDIA_DIR" --exclude='*.restore-tmp' -cf - . | zstd -q -T0 -o "$DIR/media.tar.zst"
  MEDIA_COUNT=$(find "$MEDIA_DIR" -type f | wc -l)
fi

# full applied-migration set (used for compatibility checks — never compare names lexicographically)
MIGRATIONS_JSON=$(q "select coalesce(json_agg(migration_name order by finished_at), '[]'::json) from _prisma_migrations where finished_at is not null" 2>/dev/null || echo '[]')
# manifest FIRST, then checksums over an explicit file list that INCLUDES the manifest (integrity of projectId/migrations/counts)
# `label` is a jq keyword — it cannot be a --arg variable name on jq 1.7+
# ("unexpected label"), so the variable is $lbl.
jq -n --arg created "$(date -u +%FT%TZ)" --arg lbl "$LABEL" --arg kind "$BACKUP_KIND" --arg ver "${APP_VERSION:-dev}" \
      --arg proj "$PROJECT_ID" --argjson media "$WITH_MEDIA" --argjson count "$MEDIA_COUNT" --argjson migs "$MIGRATIONS_JSON" \
      '{"createdAt":$created,"label":$lbl,"kind":$kind,"appVersion":$ver,"projectId":$proj,"withMedia":($media==1),"mediaFileCount":$count,
        "migrations":$migs,"latestMigration":($migs|last)}' > "$DIR/manifest.json"
FILES="db.dump manifest.json"; [[ -f "$DIR/media.tar.zst" ]] && FILES="$FILES media.tar.zst"
( cd "$DIR" && sha256sum $FILES > checksums.sha256 )

SIZE=$(du -sb "$DIR" | cut -f1); KEY="$(basename "$DIR")"
q "insert into \"Backup\"(id,kind,status,\"offsiteStatus\",\"fileKey\",\"sizeBytes\",\"mediaIncluded\",\"startedAt\",\"finishedAt\",\"createdAt\",\"updatedAt\")
   values (gen_random_uuid()::text,'$BACKUP_KIND','DONE','PENDING','$KEY',$SIZE,$([[ $WITH_MEDIA -eq 1 ]] && echo true || echo false),now(),now(),now(),now())" >/dev/null 2>&1 || true

# ---- off-site (independent provider; REQUIRED in production) ----
OFFSITE="NOT_CONFIGURED"
if [[ -n "${BACKUP_OFFSITE_ENDPOINT:-}" ]]; then
  log "offsite mirror"
  if mc alias set offsite "$BACKUP_OFFSITE_ENDPOINT" "$BACKUP_OFFSITE_KEY" "$BACKUP_OFFSITE_SECRET" >/dev/null 2>&1 \
     && mc mirror --overwrite "$DIR" "offsite/${BACKUP_OFFSITE_BUCKET:-backups}/$KEY" >/dev/null 2>&1; then
    OFFSITE="OK"
  else
    OFFSITE="FAILED"
  fi
fi
q "update \"Backup\" set \"offsiteStatus\"='$OFFSITE', \"offsiteSyncedAt\"=$([[ $OFFSITE == OK ]] && echo now\(\) || echo null) where \"fileKey\"='$KEY'" >/dev/null 2>&1 || true
if [[ "$OFFSITE" != "OK" && "${NODE_ENV:-}" == "production" ]]; then
  q "insert into \"SystemAlert\"(id,severity,code,message,\"createdAt\",\"updatedAt\") values (gen_random_uuid()::text,'CRITICAL','BACKUP_OFFSITE_$OFFSITE','Off-site backup $OFFSITE for $KEY',now(),now())" >/dev/null 2>&1 || true
  log "WARNING: off-site status = $OFFSITE (local backup is fine; System Health will show red)"
fi
log "done: $DIR ($SIZE bytes) local=OK offsite=$OFFSITE"
