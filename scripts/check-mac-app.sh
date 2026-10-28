#!/usr/bin/env bash
# Checks the dmg people download: its Nkata.app opens a window, so its main binary is not the CLI,
# and it runs on both Apple silicon and Intel. 0.1.0 shipped the CLI as the app.
# Usage: scripts/check-mac-app.sh <Nkata.dmg> <the universal nkata-agent CLI>
set -euo pipefail
dmg="$1"
cli="$2"
mnt="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$dmg" >/dev/null
trap 'hdiutil detach "$mnt" >/dev/null' EXIT
main="$mnt/Nkata.app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c "Print CFBundleExecutable" "$mnt/Nkata.app/Contents/Info.plist")"
[ -f "$main" ] || { echo "no main binary in Nkata.app"; exit 1; }
if cmp -s "$main" "$cli"; then
  echo "Nkata.app's main binary is the CLI"; exit 1
fi
archs=$(lipo -archs "$main")
[[ "$archs" == *arm64* && "$archs" == *x86_64* ]] || { echo "Nkata.app is $archs, not universal"; exit 1; }
echo "Nkata.app: the window, $archs"
