#!/usr/bin/env bash
# Shared ops-only maintenance handshake. Never accept a textual substring as
# evidence that writes are drained. Callers must abort on any nonzero result.
maintenance() {
  local response state=${1:?}
  [[ "$state" == on || "$state" == off ]] || return 1
  response=$(curl -fsS --max-time 15 -X POST "$APP_URL/api/system/maintenance" \
    -H "x-maintenance-secret: $MAINTENANCE_SECRET" -d "state=$state&reason=restore" 2>/dev/null) || return 1
  jq -se --arg state "$state" 'length == 1 and (.[0] | type == "object" and .state == $state)' \
    >/dev/null 2>&1 <<< "$response"
}

drain() {
  local response attempt remaining timeout deadline=$((SECONDS + 60))
  for ((attempt=0; attempt<30; attempt++)); do
    remaining=$((deadline - SECONDS))
    ((remaining > 0)) || return 1
    timeout=$((remaining < 5 ? remaining : 5))
    if response=$(curl -fsS --max-time "$timeout" "$APP_URL/api/system/maintenance" \
      -H "x-maintenance-secret: $MAINTENANCE_SECRET" 2>/dev/null) &&
      jq -se 'length == 1 and (.[0] | type == "object" and .state == "on" and .inFlight == 0)' \
        >/dev/null 2>&1 <<< "$response"; then
      return 0
    fi
    remaining=$((deadline - SECONDS))
    ((remaining > 0)) || return 1
    ((attempt == 29)) || sleep "$((remaining < 2 ? remaining : 2))"
  done
  return 1
}
