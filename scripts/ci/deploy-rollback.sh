#!/usr/bin/env bash
# Destructive proof ONLY on the generated disposable CI stack.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ ${CI:-} == true ]] || { echo 'This proof is restricted to the disposable CI stack.' >&2; exit 2; }
COMPOSE=(docker compose -f docker-compose.yml)
PROJECT=$("${COMPOSE[@]}" exec -T ops printenv PROJECT_ID)
[[ $PROJECT == hoda-ci ]] || exit 2
APP_IMAGE=$(docker inspect --format '{{.Image}}' "$("${COMPOSE[@]}" ps -q app)")
OPS_IMAGE=$(docker inspect --format '{{.Image}}' "$("${COMPOSE[@]}" ps -q ops)")
BEFORE=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc "select md5(contact::text) from \"SiteSettings\" where id='default'")
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
docker image tag "$APP_IMAGE" hoda-rollback-proof-base
cat > "$T/fail.cjs" <<'JS'
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const db = new PrismaClient();
(async () => {
  await db.siteSettings.update({where:{id:'default'},data:{contact:{rollbackSentinel:'failed-release'}}});
  fs.writeFileSync('/data/rollback-proof-wrote', 'fixture');
  await db.$disconnect();
  process.exit(1);
})().catch(() => process.exit(1));
JS
cat > "$T/Dockerfile" <<'DOCKER'
FROM hoda-rollback-proof-base
COPY fail.cjs /app/fail.cjs
CMD ["node", "/app/fail.cjs"]
DOCKER
docker build -t hoda-rollback-proof "$T"
BAD_IMAGE=$(docker image inspect --format '{{.Id}}' hoda-rollback-proof)
rc=0
bash scripts/deploy.sh --app-image "$BAD_IMAGE" --ops-image "$OPS_IMAGE" --wait-seconds 20 || rc=$?
[[ $rc == 42 ]] || { echo "Expected recovered deployment failure, got $rc"; exit 1; }
"${COMPOSE[@]}" exec -T ops test -f /data/rollback-proof-wrote
AFTER=$("${COMPOSE[@]}" exec -T postgres psql -U hoda -d hoda -tAc "select md5(contact::text) from \"SiteSettings\" where id='default'")
[[ $BEFORE == "$AFTER" ]] || { echo 'The failed release mutation was not restored'; exit 1; }
[[ $(docker inspect --format '{{.Image}}' "$("${COMPOSE[@]}" ps -q app)") == "$APP_IMAGE" ]]
"${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)})"
"${COMPOSE[@]}" exec -T ops rm /data/rollback-proof-wrote
echo 'DEPLOY ROLLBACK OK: failed image mutated synthetic data, previous image/data restored and health confirmed'
