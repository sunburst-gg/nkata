#!/usr/bin/env bash
# The eight Khronos sample models the v8 wall shows, fetched once at dev time into
# desktop/public/fixtures/glb (git-ignored, v8 Decisions 17). The environment renders ship in
# the repo next to them. make dev runs this when the models are missing. Licenses: LICENSES.md.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GLB="$ROOT/desktop/public/fixtures/glb"
BASE="https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models"
MODELS="BoomBox Lantern ToyCar SheenChair AntiqueCamera WaterBottle DamagedHelmet CesiumMan"
mkdir -p "$GLB"
for m in $MODELS; do
  if [ ! -s "$GLB/$m.glb" ]; then
    echo "fetch $m"
    curl -sfL --retry 3 -o "$GLB/$m.glb.part" "$BASE/$m/glTF-Binary/$m.glb" && mv "$GLB/$m.glb.part" "$GLB/$m.glb"
  fi
done
echo "fixtures: $(ls "$GLB" | wc -l) models"
