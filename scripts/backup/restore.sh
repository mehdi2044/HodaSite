#!/usr/bin/env bash
# Hardened restore (D23, v1.1.3). Runs ONLY inside the `ops` container (which contains prisma + migrations; NO docker socket).
# Usage: restore.sh <backup-dir|zip> --yes [--db-only] [--media-only]
# Order: validate → maintenance ON (mandatory) → drain → safety backup → DB → atomic media → migrate → verify → maintenance OFF
set -euo pipefail
source "$(dirname "$0")/lib.sh"
SRC_IN="${1:?backup path required}"; shift || true
YES=0; DB=1; MEDIA=1
for a in "$@"; do case "$a" in --yes) YES=1;; --db-only) MEDIA=0;; --media-only) DB=0;; esac; done
[[ $YES -eq 1 ]] || { echo "Refusing to restore without --yes"; exit 2; }

: "${DATABASE_URL:?}"; : "${APP_URL:?}"; : "${MAINTENANCE_SECRET:?}"; : "${PROJECT_ID:?}"
MEDIA_DIR="${MEDIA_DIR:-/data/media}"; APP_SRC="${APP_SRC:-/app}"   # ops image ships the app's prisma/ folder here
MAX_FILES="${RESTORE_MAX_FILES:-200000}"; MAX_BYTES="${RESTORE_MAX_UNCOMPRESSED_BYTES:-53687091200}"
WORK="$(mktemp -d /tmp/restore.XXXXXX)"; MAINT_ON=0; STAGE="init"
log(){ echo "[restore][$(date -u +%T)][$STAGE] $*"; }
q(){ psql "$DATABASE_URL" -Atc "$1"; }

maintenance(){ # $1 = on|off ; the app MUST confirm, otherwise we abort
  local r; r=$(curl -fsS --max-time 15 -X POST "$APP_URL/api/system/maintenance" -H "x-maintenance-secret: $MAINTENANCE_SECRET" -d "state=$1&reason=restore") || return 1
  [[ "$r" == *"\"state\":\"$1\""* ]] || return 1
}
drain(){ # wait until the app reports no in-flight requests (max 60s)
  for _ in $(seq 1 30); do
    local r; r=$(curl -fsS --max-time 5 "$APP_URL/api/system/maintenance" -H "x-maintenance-secret: $MAINTENANCE_SECRET" 2>/dev/null || echo "")
    [[ "$r" == *'"inFlight":0'* ]] && return 0; sleep 2
  done; log "drain timeout — continuing (app is in maintenance, writes are rejected)"
}
cleanup(){
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    log "FAILED at stage '$STAGE' (rc=$rc). Maintenance stays ON. Previous media (if swapped) kept at $MEDIA_DIR.prev"
    curl -fsS --max-time 10 -X POST "$APP_URL/api/system/maintenance" -H "x-maintenance-secret: $MAINTENANCE_SECRET" -d "state=on&reason=restore_failed" >/dev/null 2>&1 || true
    q "insert into \"SystemAlert\"(id,severity,code,message,\"createdAt\",\"updatedAt\") values (gen_random_uuid()::text,'CRITICAL','RESTORE_FAILED','Restore failed at stage $STAGE',now(),now())" >/dev/null 2>&1 || true
  elif [[ $MAINT_ON -eq 1 ]]; then
    maintenance off || log "WARNING: could not turn maintenance off — do it manually"
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---------- 1. validate (nothing is touched yet) ----------
STAGE="validate"; SRC="$SRC_IN"
if [[ -f "$SRC_IN" && "$SRC_IN" == *.zip ]]; then
  log "inspecting zip"
  check_zip_archive "$SRC_IN" "$MAX_FILES" "$MAX_BYTES" || exit 10   # traversal, entry count, real uncompressed size (zip bomb)
  mkdir -p "$WORK/unz"; unzip -q -n "$SRC_IN" -d "$WORK/unz"; find "$WORK/unz" -type l -delete
  SRC="$(find "$WORK/unz" -name manifest.json -exec dirname {} \; | head -1)"
fi
[[ -f "$SRC/manifest.json" ]] || { log "manifest.json missing"; exit 13; }
[[ "$(jq -r .projectId "$SRC/manifest.json")" == "$PROJECT_ID" ]] || { log "projectId mismatch"; exit 14; }
( cd "$SRC" && sha256sum -c --quiet checksums.sha256 ) || { log "checksum mismatch"; exit 15; }
[[ $DB -eq 0 || -f "$SRC/db.dump" ]] || { log "db.dump missing"; exit 16; }
[[ $MEDIA -eq 0 || -f "$SRC/media.tar.zst" ]] || { log "media.tar.zst missing (use --db-only)"; exit 17; }

# migration compatibility = SET check, not string compare: every migration in the backup must be known to the current code
if [[ $DB -eq 1 ]]; then
  jq -r '.migrations[]?' "$SRC/manifest.json" | sort > "$WORK/bak_migs.txt"
  ls "$APP_SRC/prisma/migrations" 2>/dev/null | grep -v migration_lock | sort > "$WORK/code_migs.txt" || true
  if [[ -s "$WORK/bak_migs.txt" ]]; then
    unknown=$(comm -23 "$WORK/bak_migs.txt" "$WORK/code_migs.txt")
    [[ -z "$unknown" ]] || { log "backup contains migrations unknown to this code version (newer backup?):"; echo "$unknown"; exit 18; }
  else log "manifest has no migration list (old backup) — proceeding; migrate deploy will reconcile"; fi
fi

# media archive: reject absolute paths, traversal, symlinks, hardlinks, device files BEFORE extracting (space-safe parsing)
if [[ $MEDIA -eq 1 ]]; then check_tar_archive "$SRC/media.tar.zst" "$MAX_FILES" "$MAX_BYTES" || exit 19; fi
log "validated (project=$PROJECT_ID, migrations in backup: $(wc -l < "$WORK/bak_migs.txt" 2>/dev/null || echo 0))"

# ---------- 2. maintenance ON + drain (before ANY change and before the safety backup) ----------
STAGE="maintenance-on"; maintenance on || { log "app did not confirm maintenance mode — aborting"; exit 20; }; MAINT_ON=1
STAGE="drain"; drain

# ---------- 3. safety backup (now a true point-in-time snapshot: no writes possible) ----------
STAGE="safety-backup"; BACKUP_KIND=safety "$(dirname "$0")/backup.sh" --label pre-restore

# ---------- 4. database ----------
if [[ $DB -eq 1 ]]; then
  STAGE="db"; log "pg_restore"
  pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction -d "$DATABASE_URL" "$SRC/db.dump"
fi

# ---------- 5. atomic media: extract → validate (count + content + DB consistency) → swap ----------
if [[ $MEDIA -eq 1 ]]; then
  STAGE="media-extract"; TMP="$MEDIA_DIR.restore-tmp"; rm -rf "$TMP"; mkdir -p "$TMP"
  zstd -dc "$SRC/media.tar.zst" | tar -C "$TMP" --no-same-owner --no-same-permissions -xf -
  STAGE="media-validate"
  exp=$(jq -r '.mediaFileCount // empty' "$SRC/manifest.json"); got=$(find "$TMP" -type f | wc -l)
  [[ -z "$exp" || "$exp" == "$got" ]] || { log "media file count mismatch ($got != $exp)"; exit 30; }
  # DB is already restored at this point → sampled Media.storageKey rows must exist in $TMP; sampled files must be non-empty with correct MIME
  validate_media_dir "$TMP" "$DATABASE_URL" 25 || { log "media validation failed — NOT swapping"; exit 31; }
  STAGE="media-swap"
  rm -rf "$MEDIA_DIR.prev"; [[ -d "$MEDIA_DIR" ]] && mv "$MEDIA_DIR" "$MEDIA_DIR.prev"
  mv "$TMP" "$MEDIA_DIR"; log "media validated and swapped"
fi

# ---------- 6. migrate (directly from ops, no docker socket) + verify ----------
if [[ $DB -eq 1 ]]; then
  STAGE="migrate"; ( cd "$APP_SRC" && npx prisma migrate deploy )
fi
STAGE="verify"; "$(dirname "$0")/verify.sh" --live || { log "post-restore verification failed"; exit 40; }
[[ $MEDIA -eq 1 ]] && rm -rf "$MEDIA_DIR.prev"
STAGE="done"; log "restore completed successfully"
