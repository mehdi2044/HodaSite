#!/usr/bin/env bash
# Runs INSIDE the ops container (docker compose exec ops). Full
# backup -> verify -> mutate -> restore cycle + assertions.
set -euo pipefail
cd /app

: "${BACKUP_ROOT:?}"; : "${DATABASE_URL:?}"; : "${APP_URL:?}"; : "${MAINTENANCE_SECRET:?}"; : "${APP_SRC:?}"

echo "== seed a real 1x1 PNG into the media volume =="
mkdir -p /data/media/media/2026/09
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' \
  | base64 -d > /data/media/media/2026/09/smoke.png

echo "== backup.sh --kind manual =="
scripts/backup/backup.sh --kind manual --label ci
DIR=$(ls -dt "$BACKUP_ROOT"/*_ci | head -1)
echo "backup dir: $DIR"
for f in db.dump manifest.json checksums.sha256 media.tar.zst; do
  test -f "$DIR/$f" || { echo "missing $DIR/$f"; exit 1; }
done

echo "== verify.sh <backup> =="
scripts/backup/verify.sh "$DIR"

echo "== mutate a row =="
psql "$DATABASE_URL" -c "update \"SiteSettings\" set brand = '{\"fa\":\"TAMPERED\"}'::jsonb where id = 'default'"
psql "$DATABASE_URL" -tAc "select brand->>'fa' from \"SiteSettings\"" | grep -qx TAMPERED

echo "== restore.sh <backup> --yes =="
scripts/backup/restore.sh "$DIR" --yes

echo "== assertions =="
RESTORED=$(psql "$DATABASE_URL" -tAc "select brand->>'fa' from \"SiteSettings\"")
[[ "$RESTORED" != "TAMPERED" ]] || { echo "row was not restored"; exit 1; }
test -f /data/media/media/2026/09/smoke.png || { echo "media not restored after atomic swap"; exit 1; }
ls -d "$BACKUP_ROOT"/*pre-restore* >/dev/null || { echo "no pre-restore safety backup"; exit 1; }

STATE=$(curl -fsS "$APP_URL/api/system/maintenance" -H "x-maintenance-secret: $MAINTENANCE_SECRET")
echo "maintenance after restore: $STATE"
echo "$STATE" | grep -q '"state":"off"' || { echo "maintenance left on after a successful restore"; exit 1; }

# restore.sh step 6 already ran `prisma migrate deploy` from inside ops; a
# re-run must be a clean no-op (proves the CLI + schema are present, no socket)
( cd "$APP_SRC" && npx prisma migrate deploy ) | grep -qiE 'No pending migrations|already' \
  || { echo "prisma migrate deploy from ops did not report a clean state"; exit 1; }

echo "OPS RESTORE CYCLE OK"
