#!/usr/bin/env bash
# Exercise real host orchestration with a docker process fixture. No live data.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/project/scripts/deploy" "$T/bin"
cp "$ROOT/scripts/deploy.sh" "$T/project/scripts/"
cp "$ROOT/scripts/deploy/"{maintenance.mjs,backup.sh} "$T/project/scripts/deploy/"
touch "$T/project/docker-compose.yml"
export TRACE="$T/trace" SCENARIO=success
export OLD_APP="sha256:$(printf '1%.0s' {1..64})" OLD_OPS="sha256:$(printf '2%.0s' {1..64})"
export NEW_APP="sha256:$(printf '3%.0s' {1..64})" NEW_OPS="sha256:$(printf '4%.0s' {1..64})"
cat > "$T/bin/git" <<'SH'
#!/usr/bin/env bash
if [[ $1 == rev-parse ]]; then printf '123456789abc123456789abc123456789abc1234\n'; fi
SH
cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ $1 == inspect ]]; then
  if [[ ${*: -1} == app-container ]]; then echo "$OLD_APP"; else echo "$OLD_OPS"; fi
  exit
fi
if [[ $1 == image ]]; then printf 'image\n' >> "$TRACE"; exit; fi
[[ $1 == compose ]] || exit 90
shift
generation=base
while [[ $1 == --project-directory || $1 == -f ]]; do
  case "$2" in *previous.yml) generation=old;; *next.yml) generation=new;; esac
  shift 2
done
if [[ $1 == ps ]]; then printf '%s-container\n' "${*: -1}"; exit; fi
printf '%s %s\n' "$generation" "$*" >> "$TRACE"
if [[ ${*: -1} == fingerprint ]]; then
  cat >/dev/null
  if [[ $1 == run && $SCENARIO == config-drift ]]; then printf 'b%.0s' {1..64}; else printf 'a%.0s' {1..64}; fi
  printf '\n'; exit
fi
if [[ $1 == run && $* == *'--entrypoint node'* ]]; then
  cat >/dev/null
  if [[ $SCENARIO == drain-failure && ${*: -1} == drain ]]; then exit 1; fi
  if [[ $SCENARIO == reopen-unconfirmed && $generation == new && ${*: -1} == off ]]; then exit 1; fi
  exit
fi
if [[ $1 == run && $* == *'ops -s --'* ]]; then
  cat >/dev/null
  [[ $SCENARIO != backup-failure ]] || exit 1
  echo "2026-09-12_120000_1_${*: -1}"
  exit
fi
if [[ $1 == run && ${*: -1} == migrate && $SCENARIO == migrate-failure ]]; then exit 1; fi
if [[ $1 == up && $generation == new && $* == *'--wait '* && $SCENARIO != success && $SCENARIO != workers-fail && $SCENARIO != reopen-unconfirmed ]]; then exit 1; fi
if [[ $1 == run && $* == *'/restore.sh'* && $SCENARIO == restore-failure ]]; then exit 1; fi
if [[ $1 == up && $generation == new && $* == *'ops cron' && $SCENARIO == workers-fail ]]; then exit 1; fi
SH
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH"
run_case() {
  export SCENARIO=$1
  local expected=$2 rc=0
  rm -rf "$T/project/.deploy"
  : > "$TRACE"
  bash "$T/project/scripts/deploy.sh" --app-image "$NEW_APP" --ops-image "$NEW_OPS" --wait-seconds 20 > "$T/output" 2>&1 || rc=$?
  if [[ $rc != "$expected" ]]; then cat "$T/output" "$TRACE"; echo "Expected $expected got $rc ($SCENARIO)"; exit 1; fi
}
run_case success 0
! grep -q '/restore.sh' "$TRACE"
grep -q 'SUCCEEDED' "$T/project/.deploy/releases/"*/status
grep -q "$NEW_APP" "$T/project/.deploy/active.yml"
run_case config-drift 6
! grep -qE ' stop |migrate|/restore.sh' "$TRACE"
for scenario in app-failure migrate-failure; do
  run_case "$scenario" 42
  grep -q '/restore.sh' "$TRACE"
  grep -q 'ROLLED_BACK' "$T/project/.deploy/releases/"*/status
  grep -q "$OLD_APP" "$T/project/.deploy/active.yml"
done
run_case restore-failure 43
grep -q 'ROLLBACK_FAILED' "$T/project/.deploy/releases/"*/status
! grep -q '^old up .*ops cron' "$TRACE"
for scenario in drain-failure backup-failure; do
  run_case "$scenario" 1
  ! grep -qE 'migrate|/restore.sh' "$TRACE"
done
run_case workers-fail 1
! grep -q '/restore.sh' "$TRACE"
grep -q 'WORKER_START_FAILED' "$T/project/.deploy/releases/"*/status
run_case reopen-unconfirmed 1
! grep -q '/restore.sh' "$TRACE"
grep -q 'REOPEN_UNCONFIRMED' "$T/project/.deploy/releases/"*/status
! grep -q '^new up .*ops cron' "$TRACE"
grep -q "$NEW_APP" "$T/project/.deploy/active.yml"
# Mutable tags and half-specified image pairs are rejected before Docker use.
! bash "$T/project/scripts/deploy.sh" --app-image latest --ops-image "$NEW_OPS" >/dev/null 2>&1
! bash "$T/project/scripts/deploy.sh" --app-image "$NEW_APP" >/dev/null 2>&1
echo 'deploy rollback orchestration guards: OK'
