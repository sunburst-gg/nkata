#!/usr/bin/env bash
# Writes the update manifest installed apps read (latest/latest.json in the downloads bucket):
# the version, and per platform the package's address and its signature. The macOS app is one
# universal build under its own key, darwin-universal (desktop/src-tauri/src/updates.rs).
# Format: https://v2.tauri.app/plugin/updater/#static-json-file
# Usage: scripts/updater-manifest.sh <version> <releases url> <mac .app.tar.gz> <windows -setup.exe>
# Each package's signature is the file next to it with .sig added.
set -euo pipefail
version="$1"
base="${2%/}"
mac="$3"
win="$4"
for f in "$mac" "$mac.sig" "$win" "$win.sig"; do
  [ -s "$f" ] || { echo "missing $f" >&2; exit 1; }
done
jq -n \
  --arg version "$version" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg mac_url "$base/$(basename "$mac")" \
  --arg mac_sig "$(cat "$mac.sig")" \
  --arg win_url "$base/$(basename "$win")" \
  --arg win_sig "$(cat "$win.sig")" \
  '{version: $version, notes: ("Nkata " + $version), pub_date: $date,
    platforms: {
      "darwin-universal": {url: $mac_url, signature: $mac_sig},
      "windows-x86_64": {url: $win_url, signature: $win_sig}
    }}'
