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

COMPOSE=(docker compose -f docker-compose.yml)
ok()   { printf '\n\033[32m✓ %s\033[0m\n' "$*"; }
step() { printf '\n\033[36m── %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }

step "generate .env with real random secrets"
PGPW=$(rand)
cat > .env <<EOF
APP_URL=http://app:3000
NODE_ENV=production
PROJECT_ID=hoda-ci
AUTH_SECRET=$(rand)
CRON_SECRET=$(rand)
MAINTENANCE_SECRET=$(rand)
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=$(rand)aA1!
POSTGRES_USER=hoda
POSTGRES_PASSWORD=${PGPW}
POSTGRES_DB=hoda
DATABASE_URL=postgresql://hoda:${PGPW}@postgres:5432/hoda
STORAGE_PROVIDER=local
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

step "ops has NO docker socket"
"${COMPOSE[@]}" exec -T ops sh -c '! test -S /var/run/docker.sock' || fail "ops has a docker socket"
ok "no docker socket in ops"

step "full backup -> verify -> restore cycle inside ops"
"${COMPOSE[@]}" exec -T ops bash /app/scripts/ci/ops-restore-cycle.sh
ok "backup / verify / restore cycle passed"

step "negative guard cases inside ops"
"${COMPOSE[@]}" exec -T ops bash /app/scripts/ci/ops-negative-guards.sh
ok "negative guard cases passed"

ok "RUNTIME SMOKE PASSED"
