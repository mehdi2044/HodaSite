#!/usr/bin/env bash
# Real Docker runtime check for the production stack (Vee's GO condition for
# closing the Foundation). Run on a host with Docker + docker compose.
#
#   scripts/ci/runtime-smoke.sh
#
# Brings up docker-compose.yml with a generated .env, proves migrations ran
# against the real Postgres, the app answers /api/health with db:ok, then runs
# one full backup -> verify -> restore cycle inside the ops container plus the
# negative guard cases. The caller collects logs and runs `down -v` afterwards
# (see the docker-runtime job in .github/workflows/ci.yml).
set -euo pipefail
cd "$(dirname "$0")/../.."
STORAGE_MODE="${1:-local}"
[[ "$STORAGE_MODE" == "local" || "$STORAGE_MODE" == "s3" ]] || { echo "usage: $0 [local|s3]"; exit 2; }

COMPOSE=(docker compose -f docker-compose.yml)
ok()   { printf '\n\033[32m✓ %s\033[0m\n' "$*"; }
step() { printf '\n\033[36m── %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }

step "generate .env with real random secrets"
PGPW=$(rand)
CRON_SECRET_VALUE=$(rand)
cat > .env <<EOF
APP_URL=http://app:3000
NODE_ENV=production
PROJECT_ID=hoda-ci
AUTH_SECRET=$(rand)
CRON_SECRET=${CRON_SECRET_VALUE}
MAINTENANCE_SECRET=$(rand)
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=$(rand)aA1!
POSTGRES_USER=hoda
POSTGRES_PASSWORD=${PGPW}
POSTGRES_DB=hoda
DATABASE_URL=postgresql://hoda:${PGPW}@postgres:5432/hoda
STORAGE_PROVIDER=${STORAGE_MODE}
MEDIA_DIR=/data/media
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=media
S3_ACCESS_KEY=$(rand)
S3_SECRET_KEY=$(rand)
S3_PUBLIC_URL=http://localhost:9000/media
BACKUP_ROOT=/backups
RESTORE_MAX_FILES=200000
RESTORE_MAX_UNCOMPRESSED_BYTES=53687091200
EOF
grep -qE '^AUTH_SECRET=.{20,}$' .env || fail "AUTH_SECRET is not random"
grep -q 'ChangeMe123' .env && fail ".env still contains example values"

step "docker compose up -d --build --wait"
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 360

step "migrate service applied migrations against the real Postgres"
"${COMPOSE[@]}" ps -a --format '{{.Service}} {{.Status}}' | grep -Ei '^migrate .*exited \(0\)' \
  || { "${COMPOSE[@]}" ps -a; fail "migrate service did not exit 0"; }
APPLIED=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc \
  "select count(*) from _prisma_migrations where finished_at is not null")
APPLIED=${APPLIED//[[:space:]]/}
[[ "$APPLIED" -ge 2 ]] || fail "expected >= 2 applied migrations, got '$APPLIED'"
ok "migrations applied: $APPLIED"

step "app answers /api/health with db:ok"
HEALTH=$("${COMPOSE[@]}" exec -T app node -e \
  'const h=require("http");h.get("http://127.0.0.1:3000/api/health",r=>{let b="";r.on("data",d=>b+=d);r.on("end",()=>{process.stdout.write(b);process.exit(r.statusCode===200?0:1)})}).on("error",e=>{console.error(e.message);process.exit(1)})')
echo "  $HEALTH"
echo "$HEALTH" | grep -q '"db":"ok"' || fail "health did not report db:ok"
# `app` has no host port — it is only reachable inside the compose network.
"${COMPOSE[@]}" port app 3000 2>/dev/null && fail "app must not publish a host port" || true
ok "health ok, app not published"

step "seed the demo shop (from the ops image)"
"${COMPOSE[@]}" run --rm ops npx prisma db seed
MARKETS=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc 'select count(*) from "Market"')
[[ "${MARKETS//[[:space:]]/}" == "3" ]] || fail "expected 3 markets, got '$MARKETS'"
ok "seeded (3 markets)"

step "seed demo media reaches READY with real sharp variants (Phase 01b acceptance criterion 1)"
# The `cron` sidecar ticks /api/cron/tick every 60s, which runs the
# media-optimize job (registered by src/instrumentation.ts on app boot) —
# this is the real webp/avif pipeline, not a mock, running against the
# `app` image built from the actual Dockerfile.
READY=0
for _ in $(seq 1 18); do
  READY=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc \
    "select count(*) from \"Media\" where \"originalName\" like 'seed-%' and status = 'READY' and variants != '{}'::jsonb")
  READY=${READY//[[:space:]]/}
  [[ "$READY" == "12" ]] && break
  sleep 10
done
[[ "$READY" == "12" ]] || {
  "${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc \
    "select status, \"processingError\" from \"Media\" where \"originalName\" like 'seed-%' and status != 'READY'"
  fail "expected 12 seed media READY with variants, got '$READY'"
}
ok "12 seed images READY with webp+avif variants"

if [[ "$STORAGE_MODE" == "s3" ]]; then
  step "S3 provider put/get/delete, optimize and stream against MinIO"
  MEDIA_ID=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc \
    "select m.id from \"Media\" m
     where m.\"originalName\" like 'seed-%' and m.status='READY'
       and not exists (select 1 from \"ProductMedia\" pm where pm.\"mediaId\"=m.id)
       and not exists (select 1 from \"VariantMedia\" vm where vm.\"mediaId\"=m.id)
     limit 1")
  MEDIA_ID=${MEDIA_ID//[[:space:]]/}
  [[ -n "$MEDIA_ID" ]] || fail "missing unreferenced S3 smoke media"
  VARIANT=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc \
    "select variants->'webp'->'320'->>'url' from \"Media\" where id='${MEDIA_ID}'")
  VARIANT=${VARIANT//[[:space:]]/}
  [[ "$VARIANT" == /media/* ]] || fail "missing S3 variant URL"
  "${COMPOSE[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3000${VARIANT}',{redirect:'follow'}).then(async r=>{if(!r.ok)throw Error(String(r.status));let b=await r.arrayBuffer();if(!b.byteLength)throw Error('empty')}).catch(e=>{console.error(e);process.exit(1)})"
  # Copy a second seeded original to a unique staging key, then run the real
  # media-replace handler through cron. Reusing the source Media.storageKey
  # would violate Media's unique constraint and would not model a real upload.
  SOURCE_KEY=$(${COMPOSE[@]} exec -T postgres psql -U hoda -d hoda -tAc \
    "select \"storageKey\" from \"Media\" where id <> '${MEDIA_ID}' and status='READY' limit 1")
  SOURCE_KEY=${SOURCE_KEY//[[:space:]]/}
  [[ -n "$SOURCE_KEY" ]] || fail "missing S3 replacement source"
  REPLACEMENT_KEY="media/replacements/s3-smoke-input.jpg"
  "${COMPOSE[@]}" run --rm --entrypoint /bin/sh minio-init -c \
    'mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null && mc cp "local/$S3_BUCKET/'"${SOURCE_KEY}"'" "local/$S3_BUCKET/'"${REPLACEMENT_KEY}"'" >/dev/null'
  "${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -v ON_ERROR_STOP=1 -c \
    "insert into \"MediaReplacement\"(id,\"mediaId\",\"baseStorageKey\",\"storageKey\",url,\"originalName\",bytes,mime,width,height,status,\"requestedBy\",\"createdAt\",\"updatedAt\")
     select 's3-replace-smoke', target.id, target.\"storageKey\", '${REPLACEMENT_KEY}', '/media/${REPLACEMENT_KEY}',
            's3-replacement.jpg', source.bytes, source.mime, source.width, source.height,
            'PENDING', owner.id, now(), now()
     from \"Media\" target
     cross join lateral (select * from \"Media\" where id <> target.id and status='READY' limit 1) source
     cross join lateral (select id from \"User\" limit 1) owner
     where target.id='${MEDIA_ID}';
     insert into \"Job\"(id,type,payload,status,attempts,\"runAt\",\"createdAt\",\"updatedAt\")
     values ('s3-replace-job','media-replace','{\"replacementId\":\"s3-replace-smoke\"}'::jsonb,'PENDING',0,now(),now(),now());" >/dev/null
  "${COMPOSE[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3000/api/cron/tick',{method:'POST',headers:{authorization:'Bearer ${CRON_SECRET_VALUE}'}}).then(r=>{if(!r.ok)throw Error(String(r.status))}).catch(e=>{console.error(e);process.exit(1)})"
  REPLACED=$(${COMPOSE[@]} exec -T postgres psql -U hoda -d hoda -tAc \
    "select count(*) from \"Media\" m join \"MediaReplacement\" r on r.\"mediaId\"=m.id where r.id='s3-replace-smoke' and r.status='DONE' and m.id='${MEDIA_ID}' and m.\"storageKey\"=r.\"storageKey\"")
  [[ "${REPLACED//[[:space:]]/}" == "1" ]] || fail "S3 media replacement did not finish atomically"
  # Age one row and run the real purge handler. This exercises
  # S3Storage.delete for the original and every variant; the DB row must be
  # removed only after all object deletions succeed.
  "${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -v ON_ERROR_STOP=1 -c \
    "update \"Media\" set \"deletedAt\"=now()-interval '31 days' where id='${MEDIA_ID}';
     insert into \"Job\"(id,type,payload,status,attempts,\"runAt\",\"createdAt\",\"updatedAt\")
     values ('s3-purge-smoke','media-purge','{}', 'PENDING',0,now(),now(),now())
     on conflict (id) do nothing" >/dev/null
  "${COMPOSE[@]}" exec -T app node -e \
    "fetch('http://127.0.0.1:3000/api/cron/tick',{method:'POST',headers:{authorization:'Bearer ${CRON_SECRET_VALUE}'}}).then(r=>{if(!r.ok)throw Error(String(r.status))}).catch(e=>{console.error(e);process.exit(1)})"
  PURGED=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc \
    "select count(*) from \"Media\" where id='${MEDIA_ID}'")
  [[ "${PURGED//[[:space:]]/}" == "0" ]] || fail "S3 purge did not remove media row"
  ok "S3 provider put/get/delete, optimize and stream passed"
fi

step "ops has NO docker socket"
"${COMPOSE[@]}" exec -T ops sh -c '! test -S /var/run/docker.sock' || fail "ops has a docker socket"
ok "no docker socket in ops"

step "full backup -> verify -> restore cycle inside ops"
"${COMPOSE[@]}" exec -T ops bash /app/scripts/ci/ops-restore-cycle.sh
ok "backup / verify / restore cycle passed"
if [[ "$STORAGE_MODE" == s3 ]]; then
  "${COMPOSE[@]}" exec -T ops bash /app/scripts/ci/s3-interrupted-restore.sh
  KEY=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc "select url from \"Media\" where kind='image' and status='READY' and \"deletedAt\" is null limit 1")
  "${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000'+process.argv[1]).then(async r=>{if(!r.ok || !(await r.arrayBuffer()).byteLength)throw Error('restored media is unavailable')}).catch(e=>{console.error(e);process.exit(1)})" "$KEY"
  ok "S3 restored generation serves media; interrupted staging preserves active generation"
fi

step "typed ops panel backup/export/verify/upload/restore cycle"
"${COMPOSE[@]}" exec -T ops node /app/scripts/ci/ops-panel-cycle.mjs
ok "ops panel cycle passed"

step "negative guard cases inside ops"
"${COMPOSE[@]}" exec -T ops bash /app/scripts/ci/ops-negative-guards.sh
ok "negative guard cases passed"

if [[ "$STORAGE_MODE" == local ]]; then
  step "failed deployment restores previous image and pre-deployment data"
  bash scripts/ci/deploy-rollback.sh
fi

ok "RUNTIME SMOKE PASSED"
