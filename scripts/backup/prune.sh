#!/usr/bin/env bash
# Keep N daily / weekly / monthly backups. Draft; Claude Code finalizes.
set -euo pipefail
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"; KEEP_DAILY=${KEEP_DAILY:-7}; KEEP_WEEKLY=${KEEP_WEEKLY:-4}; KEEP_MONTHLY=${KEEP_MONTHLY:-6}
cd "$BACKUP_ROOT"
ls -1d 20*_scheduled 2>/dev/null | sort -r | awk -v d=$KEEP_DAILY -v w=$KEEP_WEEKLY -v m=$KEEP_MONTHLY '
{ split($0,p,"_"); date=p[1]; cmd="date -d "date" +%u:%d"; cmd | getline dw; close(cmd); split(dw,x,":");
  keep=0; if (NR<=d) keep=1; else if (x[1]==7 && wk<w) {keep=1; wk++} else if (x[2]=="01" && mo<m) {keep=1; mo++}
  if (!keep) print $0 }' | while read -r dir; do echo "[prune] rm $dir"; rm -rf -- "$dir"; done
