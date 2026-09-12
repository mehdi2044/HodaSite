#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../maintenance.sh"
APP_URL=http://app:3000 MAINTENANCE_SECRET=test-only
RESPONSE='{"state":"on","inFlight":0}' CURL_FAILURE=0
curl() { [[ $CURL_FAILURE == 0 ]] || return 22; printf '%s' "$RESPONSE"; }
sleep() { :; } # Unit fixture: no wall-clock delay; all 30 probes still execute.
maintenance on
drain
RESPONSE='{ "state": "on", "inFlight": 0 }'; maintenance on; drain
for RESPONSE in \
  '{"state":"on","inFlight":1}' \
  '{"state":"on","inFlight":"0"}' \
  '{"state":"on"}' \
  '{"state":"off","inFlight":0}' \
  '{"state":"on","inFlight":0.5}' \
  '{"state":"on","inFlight":-1}' \
  '{"message":"inFlight:0","state":"on"}' \
  '[{"state":"on","inFlight":0}]' \
  '{"state":"off"}{"state":"on","inFlight":0}' \
  'not-json'; do
  if drain; then echo 'unsafe drain response accepted'; exit 1; fi
done
RESPONSE='{"message":"state:on"}'; ! maintenance on
RESPONSE='{"state":"off","inFlight":0}'; ! maintenance on; maintenance off
CURL_FAILURE=1; ! maintenance on; ! drain
echo 'maintenance handshake guards: OK'
