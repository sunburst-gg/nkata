#!/usr/bin/env bash
# v8 step 19, the gate (needs_editor). An Unreal editor must be open with the Nkata plugin and
# Remote Control on port 30010. A real Blender saves a prop three times into a project the agent
# serves with Unreal on: each save must land in the preview folder and leave the game's folder
# empty; Publish must import into the game's folder; with Live in Unreal off, a save must reach
# the team and not Unreal.
# Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/preview_then_import.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/preview-then-import"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
RC="${NKATA_UE5_URL:-http://127.0.0.1:30010}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7408
APORT=7428
SERVER=http://127.0.0.1:$PORT
rm -rf "$E" && mkdir -p "$E/home" "$E/proj" "$E/zip" "$E/stage"
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${WATCH_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
curl -sf "$RC/remote/info" >/dev/null || fail "no Unreal editor with Remote Control at $RC"

# Python in the open editor through Remote Control; ExecuteFile runs a script of several lines.
ue_py() {
  local body; body=$(jq -n --arg c "$1" '{objectPath: "/Script/PythonScriptPlugin.Default__PythonScriptLibrary", functionName: "ExecutePythonCommandEx", parameters: {PythonCommand: $c, ExecutionMode: "ExecuteFile"}}')
  curl -s -X PUT "$RC/remote/object/call" -H 'content-type: application/json' -d "$body" | jq -r '[.LogOutput[]?.Output] | join("\n")'
}

set -a; source ./scripts/testenv.sh up; set +a
export NKATA_DEV=1 UNREAL_ENABLED=1 PORT PUBLIC_URL=$SERVER LOG_LEVEL=info
pnpm --filter @nkata/server db:reset >/dev/null && pnpm --filter @nkata/server seed >/dev/null
pnpm --filter @nkata/server start > "$E/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do curl -sf $SERVER/health >/dev/null && break; sleep 0.2; done
curl -sf $SERVER/health >/dev/null || { tail -20 "$E/server.log"; fail "server did not start"; }

TOKEN=$(cd "$E/proj" && $BIN login --server $SERVER --email env@sunburst.gg | jq -r .token)
PROJECT=$(curl -s -H "Authorization: Bearer $TOKEN" $SERVER/projects | jq -r '.projects[0].id')
(cd "$E/proj" && $BIN init --server $SERVER --project "$PROJECT" --token "$TOKEN" >/dev/null)
HOME="$E/home" $BIN --folder "$E/proj" serve --port $APORT --ue5-url "$RC" --ue5-scripts "$ROOT/ue5-plugin/scripts" > "$E/agent.log" 2>&1 &
AGENT_PID=$!
$BIN --folder "$E/proj" watch --pull-every-secs 2 > "$E/watch.log" 2>&1 &
WATCH_PID=$!
for _ in $(seq 1 50); do curl -sf -H "Authorization: Bearer $(cat "$E/proj/.nkata-agent/token" 2>/dev/null)" http://127.0.0.1:$APORT/me >/dev/null && break; sleep 0.2; done
ATOKEN=$(cat "$E/proj/.nkata-agent/token")

cp -r blender-addon/. "$E/stage/" && rm -rf "$E/stage/tests" "$E/stage/nkata/nkata_shared" && cp -r shared/py "$E/stage/nkata/nkata_shared"
(cd "$E/stage" && zip -qr "$E/zip/nkata-addon.zip" . -x '*/__pycache__/*' '*.pyc')
HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" "$B" --command extension install-file -r user_default -e "$E/zip/nkata-addon.zip" 2>&1 | tail -1

cat > "$E/save.py" <<'PY'
# A crate in Objects/: a new file the first time, a little wider on every later save.
import bpy
from pathlib import Path
E = Path(__file__).resolve().parent
target = E / "proj" / "Objects" / "Crate" / "Crate.blend"
if not bpy.data.filepath:
    target.parent.mkdir(parents=True, exist_ok=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    # A prop sits on its origin: the base at z 0, the origin there, or the add-on refuses it.
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
    crate = bpy.context.active_object
    crate.name = "SM_Crate"
    for v in crate.data.vertices:
        v.co.z += 1.0
    print("SAVE_RESULT", bpy.ops.wm.save_as_mainfile(filepath=str(target)))
else:
    # Reshape the mesh, not the object: a prop exports at scale 1 or the add-on refuses it.
    for v in bpy.data.objects["SM_Crate"].data.vertices:
        v.co.x *= 1.1
    print("SAVE_RESULT", bpy.ops.wm.save_mainfile())
PY

api() { curl -s -H "Authorization: Bearer $TOKEN" "$SERVER$1"; }
blender() { HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" NKATA_AGENT_URL=http://127.0.0.1:$APORT "$B" -b ${1:+"$1"} --python "$E/save.py" > "$E/save.log" 2>&1; grep -E "^SAVE_RESULT|Traceback" "$E/save.log" | head -2; }
newest() { api "/parts/$PART/versions" | jq -r '.versions | max_by(.created_at) | "\(.id) \(.mirror_status)"'; }
# Waits for the newest version's mirror to settle; prints its status.
settle() {
  for _ in $(seq 1 80); do
    local st; st=$(newest | cut -d' ' -f2)
    case "$st" in synced|failed) echo "$st"; return;; esac
    sleep 0.25
  done
  newest | cut -d' ' -f2
}
# The static meshes in the preview folder and in the game's folder, as "preview game".
meshes() {
  ue_py "import unreal
for root in ('/Game/Nkata/_Preview/Crate/$PARTNAME', '/Game/Nkata/Crate/$PARTNAME'):
    paths = unreal.EditorAssetLibrary.list_assets(root, recursive=True) if unreal.EditorAssetLibrary.does_directory_exist(root) else []
    print('MESHES', sum(isinstance(unreal.EditorAssetLibrary.load_asset(p), unreal.StaticMesh) for p in paths))" | grep MESHES | awk '{print $2}' | paste -sd' ' -
}

blender
PART=$(api "/parts?project_id=$PROJECT" | jq -r '.parts[] | select(.asset_name=="Crate") | .id')
[ -n "$PART" ] || { tail -20 "$E/save.log"; fail "the save made no asset"; }
PARTNAME=$(api "/parts?project_id=$PROJECT" | jq -r --arg id "$PART" '.parts[] | select(.id == $id) | .name')
for n in 1 2 3; do
  [ "$n" = 1 ] || blender "$E/proj/Objects/Crate/Crate.blend"
  S=$(settle); M=$(meshes); echo "save $n: $S, preview and game meshes: $M"
  [ "$S" = synced ] || { grep -iE "mirror" "$E/agent.log" | tail -3 | cut -c1-300; fail "save $n did not reach the preview"; }
  [ "$M" = "1 0" ] || fail "save $n touched the game's folder, or missed the preview"
done

echo "publish: $(curl -s -X POST -H "Authorization: Bearer $ATOKEN" -H 'content-type: application/json' http://127.0.0.1:$APORT/parts/$PART/publish -d '{"v":1,"check_results":[],"ready":false,"note":"Crate, third pass"}' | jq -c '{published}')"
for _ in $(seq 1 60); do grep -q "published imported" "$E/agent.log" && break; sleep 0.5; done
LINE=$(grep "published imported" "$E/agent.log" | tail -1)
echo "$LINE" | grep -q '"ok":true' || { echo "$LINE" | cut -c1-300; fail "Publish did not import into the game"; }
M=$(meshes); echo "after publish, preview and game meshes: $M"
[ "$M" = "1 1" ] || fail "Publish did not put the crate in the game's folder"

echo "switch off: $(curl -s -X POST -H "Authorization: Bearer $ATOKEN" -H 'content-type: application/json' http://127.0.0.1:$APORT/parts/$PART/mirror/on-save -d '{"v":1,"on_save":false}' | jq -c '.mirror.on_save')"
BEFORE=$(newest | cut -d' ' -f1)
blender "$E/proj/Objects/Crate/Crate.blend"
for _ in $(seq 1 40); do [ "$(newest | cut -d' ' -f1)" != "$BEFORE" ] && break; sleep 0.25; done
sleep 4
AFTER=$(newest)
echo "save with the switch off: $AFTER"
[ "${AFTER%% *}" != "$BEFORE" ] || fail "the save with the switch off made no version"
[ "${AFTER##* }" != synced ] || fail "the save with the switch off reached Unreal"
echo "PREVIEW THEN IMPORT OK"
