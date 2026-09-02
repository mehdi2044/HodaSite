#!/usr/bin/env bash
# Shared helpers for backup/restore/verify (v1.1.3). Source this file; do not execute.
# All functions are FAIL-CLOSED: any parsing/query failure returns non-zero.

# zip_uncompressed_bytes <zip>  → prints total uncompressed bytes (machine-readable: sums the per-entry size column of `unzip -Z -l`)
zip_uncompressed_bytes() {
  local zip="$1" listing sum summary
  listing=$(unzip -Z -l -- "$zip" 2>/dev/null) || return 1
  # per-entry lines start with a permission string (-rw..., drwx...); column 4 = uncompressed size
  sum=$(echo "$listing" | awk '$1 ~ /^[-d][-rwxsStT]{9}$/ && $4 ~ /^[0-9]+$/ {s+=$4} END{printf "%d", s+0}')
  # cross-check with the summary line "N files, X bytes uncompressed, ..."
  summary=$(echo "$listing" | grep -Eo '[0-9]+ bytes uncompressed' | grep -Eo '^[0-9]+' | tail -1)
  [[ -n "$summary" && "$summary" != "$sum" ]] && { echo "[zip-size] listing sum ($sum) != summary ($summary)" >&2; return 2; }
  echo "$sum"
}

# check_zip_archive <zip> <max_files> <max_bytes>  → rejects traversal/absolute paths, too many entries, zip bombs
check_zip_archive() {
  local zip="$1" max_files="$2" max_bytes="$3" entries n total
  entries=$(unzip -Z1 -- "$zip" 2>/dev/null) || { echo "[zip-check] cannot list archive"; return 1; }
  n=$(echo "$entries" | grep -c . || true)
  [[ "$n" -le "$max_files" ]] || { echo "[zip-check] too many entries ($n > $max_files)"; return 1; }
  echo "$entries" | grep -Eq '(^/|(^|/)\.\.(/|$))' && { echo "[zip-check] unsafe path in zip"; return 1; }
  total=$(zip_uncompressed_bytes "$zip") || { echo "[zip-check] cannot determine uncompressed size"; return 1; }
  [[ "$total" -le "$max_bytes" ]] || { echo "[zip-check] uncompressed size too large ($total > $max_bytes)"; return 1; }
  return 0
}

# tar_uncompressed_bytes <zst-file> → sum of entry sizes from `tar -tvf` (column 3, before the name → space-safe)
tar_uncompressed_bytes() {
  local zst="$1" sum
  sum=$(zstd -dc -- "$zst" | tar -tvf - | awk '$3 ~ /^[0-9]+$/ {s+=$3} END{printf "%d", s+0}') || return 1
  [[ "$sum" =~ ^[0-9]+$ ]] || return 1
  echo "$sum"
}

# check_tar_archive <zst-file> <max_files> <max_bytes> — reject links/devices/absolute/traversal, too many files, zip bombs
check_tar_archive() {
  local zst="$1" max_files="$2" max_bytes="$3" types names cnt total
  types=$(zstd -dc -- "$zst" | tar -tvf - | cut -c1) || { echo "[tar-check] cannot list archive"; return 1; }
  echo "$types" | grep -Eq '^[lhbcp]' && { echo "[tar-check] archive contains links/devices — rejected"; return 1; }
  names=$(zstd -dc -- "$zst" | tar -tf -) || return 1
  echo "$names" | grep -Eq '(^/|(^|/)\.\.(/|$))' && { echo "[tar-check] unsafe path in archive"; return 1; }
  cnt=$(echo "$names" | grep -vc '/$' || true)
  [[ "$cnt" -le "$max_files" ]] || { echo "[tar-check] too many files ($cnt > $max_files)"; return 1; }
  total=$(tar_uncompressed_bytes "$zst") || { echo "[tar-check] cannot determine uncompressed size"; return 1; }
  [[ "$total" -le "$max_bytes" ]] || { echo "[tar-check] uncompressed size too large ($total > $max_bytes)"; return 1; }
  return 0
}

# validate_media_dir <dir> <database_url> [sample_size]
# FAIL-CLOSED: sampled files must be non-empty with correct MIME AND the DB query for Media.storageKey must succeed
# and every sampled key must exist on disk. If the query fails for any reason → validation fails.
# Only when NODE_ENV != production AND MEDIA_DB_CHECK=skip may the DB part be skipped (early dev phases without a Media table).
validate_media_dir() {
  local dir="$1" dburl="$2" n="${3:-25}" bad=0 missing=0 f k keys
  [[ -d "$dir" ]] || { echo "[media-validate] dir missing: $dir"; return 1; }
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    [[ -s "$f" ]] || { bad=$((bad+1)); continue; }
    case "${f##*.}" in
      jpg|jpeg|png|webp|avif|gif) file --mime-type -b -- "$f" | grep -q '^image/' || bad=$((bad+1));;
      pdf) file --mime-type -b -- "$f" | grep -q 'pdf' || bad=$((bad+1));;
      mp4|webm) file --mime-type -b -- "$f" | grep -q '^video/' || bad=$((bad+1));;
    esac
  done < <(find "$dir" -type f -print0 | shuf -z -n "$n" | tr '\0' '\n')
  [[ $bad -eq 0 ]] || { echo "[media-validate] $bad sampled files are empty/corrupt"; return 2; }

  if [[ "${MEDIA_DB_CHECK:-required}" == "skip" && "${NODE_ENV:-}" != "production" ]]; then
    echo "[media-validate] WARNING: DB consistency check skipped (MEDIA_DB_CHECK=skip, non-production)"; return 0
  fi
  keys=$(psql "$dburl" -v ON_ERROR_STOP=1 -Atc "select \"storageKey\" from \"Media\" where \"deletedAt\" is null order by random() limit $n") \
    || { echo "[media-validate] DB query for Media.storageKey FAILED — failing closed"; return 4; }
  while IFS= read -r k; do
    [[ -n "$k" ]] || continue
    [[ -f "$dir/$k" ]] || missing=$((missing+1))
  done <<< "$keys"
  [[ $missing -eq 0 ]] || { echo "[media-validate] $missing sampled Media rows have no file on disk"; return 3; }
  echo "[media-validate] OK (sample=$n)"
}

# sanitize_label <text> → only [A-Za-z0-9._-], max 40 chars
sanitize_label() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-40; }
