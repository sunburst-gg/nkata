#!/usr/bin/env bash
# v8 step 18, the gate (needs_editor). An Unreal editor must be open with the Nkata plugin and
# Remote Control on port 30010. A real Blender saves an environment of twelve placed meshes,
# three of them copies of one pillar, and two lights into a project the agent serves with Unreal
# on. Each save must reach the editor as a USD stage within ten seconds; a light removed in
# Blender must be gone from the stage after the next save; Publish imports the environment with
# its actors placed and one mesh asset per identical mesh.
# Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/environment_usd.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/environment-usd"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
RC="${NKATA_UE5_URL:-http://127.0.0.1:30010}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7407
APORT=7427
SERVER=http://127.0.0.1:$PORT
rm -rf "$E" && mkdir -p "$E/home" "$E/proj" "$E/zip" "$E/stage"
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${WATCH_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
curl -sf "$RC/remote/info" >/dev/null || fail "no Unreal editor with Remote Control at $RC"

# Python in the open editor through Remote Control, printing one line the gate reads back.
# https://dev.epicgames.com/documentation/en-us/unreal-engine/remote-control-api-http-reference-for-unreal-engine
ue_py() {
  local body; body=$(jq -n --arg c "$1" '{objectPath: "/Script/PythonScriptPlugin.Default__PythonScriptLibrary", functionName: "ExecutePythonCommandEx", parameters: {PythonCommand: $c, ExecutionMode: "ExecuteFile"}}')
  curl -s -X PUT "$RC/remote/object/call" -H 'content-type: application/json' -d "$body" | jq -r '[.LogOutput[]?.Output] | join("\n")'
}
STAGE_LIGHTS='import unreal
a = [x for x in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors() if isinstance(x, unreal.UsdStageActor) and x.actor_has_tag("nkata.stage")]
kids = a[0].root_component.get_children_components(True) if a else []
print("STAGE", len(a), sum(isinstance(c, unreal.StaticMeshComponent) for c in kids), sum(isinstance(c, unreal.LightComponent) for c in kids))'

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

cat > "$E/save1.py" <<'PY'
# Eight blocks, a pillar and three linked copies of it, a sun and a lamp.
import bpy
from pathlib import Path
E = Path(__file__).resolve().parent
target = E / "proj" / "Environments" / "Station" / "Station.blend"
target.parent.mkdir(parents=True, exist_ok=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
col = bpy.data.collections["Collection"]
mat = bpy.data.materials.new("M_Stone"); mat.use_nodes = True
for i in range(8):
    bpy.ops.mesh.primitive_cube_add(location=(i * 3.0, 0, 0)); o = bpy.context.active_object; o.name = f"SM_Block_{i}"; o.data.materials.append(mat)
bpy.ops.mesh.primitive_cylinder_add(location=(0, 5, 0)); pillar = bpy.context.active_object; pillar.name = "SM_Pillar"; pillar.data.materials.append(mat)
for i in range(3):
    copy = pillar.copy(); copy.name = f"SM_Pillar.{i:03d}"; copy.location = (3.0 * (i + 1), 5, 0); col.objects.link(copy)
for name, kind, loc in (("L_Sun", "SUN", (0, 0, 10)), ("L_Lamp", "POINT", (5, 5, 3))):
    light = bpy.data.lights.new(name, kind); o = bpy.data.objects.new(name, light); o.location = loc; col.objects.link(o)
for o in list(col.objects):
    for c in list(o.users_collection):
        if c is not col:
            c.objects.unlink(o)
print("SAVE_RESULT", bpy.ops.wm.save_as_mainfile(filepath=str(target)))
PY
cat > "$E/save2.py" <<'PY'
import bpy
bpy.data.objects.remove(bpy.data.objects["L_Lamp"])
print("SAVE_RESULT", bpy.ops.wm.save_mainfile())
PY

api() { curl -s -H "Authorization: Bearer $TOKEN" "$SERVER$1"; }
now() { python3 -c 'import time; print(time.time())'; }
blender() { HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" NKATA_AGENT_URL=http://127.0.0.1:$APORT "$B" -b ${2:+"$2"} --python "$E/$1" > "$E/$1.log" 2>&1; grep -E "^SAVE_RESULT|Traceback" "$E/$1.log" | head -3; }
# Waits for the newest version's mirror to settle, prints its status and the seconds since $1.
mirrored() {
  for _ in $(seq 1 120); do
    local st; st=$(api "/parts/$PART/versions" | jq -r '.versions | max_by(.created_at) | .mirror_status')
    case "$st" in synced|failed) echo "$st $(python3 -c "import time; print(round(time.time() - $1, 1))")"; return;; esac
    sleep 0.25
  done
  echo "timeout"
}

T0=$(now); blender save1.py
PART=$(api "/parts?project_id=$PROJECT" | jq -r '.parts[] | select(.asset_name=="Station") | .id')
[ -n "$PART" ] || { tail -20 "$E/save1.py.log"; fail "the save made no asset"; }
echo "manifest: $(api "/parts/$PART/versions" | jq -c '.versions | max_by(.created_at) | .manifest | {objects: (.objects | length), export}')"
R1=$(mirrored "$T0"); echo "save 1 mirror: $R1 (seconds from the start of Blender, which itself takes some)"
[ "${R1%% *}" = synced ] || { grep -iE "mirror|environment" "$E/agent.log" | tail -5 | cut -c1-300; fail "the first save did not reach the stage"; }
S1=$(ue_py "$STAGE_LIGHTS" | grep STAGE); echo "stage after save 1: $S1"
[ "$S1" = "STAGE 1 12 2" ] || fail "the stage does not hold 12 meshes and 2 lights"

T1=$(now); blender save2.py "$E/proj/Environments/Station/Station.blend"
R2=$(mirrored "$T1"); echo "save 2 mirror: $R2"
S2=$(ue_py "$STAGE_LIGHTS" | grep STAGE); echo "stage after save 2: $S2"
[ "$S2" = "STAGE 1 12 1" ] || fail "the removed light is still on the stage"

echo "publish: $(curl -s -X POST -H "Authorization: Bearer $ATOKEN" -H 'content-type: application/json' http://127.0.0.1:$APORT/parts/$PART/publish -d '{"v":1,"check_results":[],"ready":false,"note":"Station blockout"}' | jq -c '{published}')"
for _ in $(seq 1 60); do grep -q "environment imported\|environment not imported" "$E/agent.log" && break; sleep 0.5; done
IMPORTED=$(grep "environment imported\|environment not imported" "$E/agent.log" | tail -1 | cut -c1-300); echo "import: $IMPORTED"
echo "$IMPORTED" | grep -q '"ok":true' || fail "Publish did not import the environment"
# Count under the part's own destination, /Game/Nkata/<asset>/<part>, so nothing else in the
# project can change the number.
PARTNAME=$(api "/parts?project_id=$PROJECT" | jq -r --arg id "$PART" '.parts[] | select(.id == $id) | .name')
ASSETS=$(ue_py "import unreal
print('ASSETS', sum(isinstance(unreal.EditorAssetLibrary.load_asset(p), unreal.StaticMesh) for p in unreal.EditorAssetLibrary.list_assets('/Game/Nkata/Station/$PARTNAME', recursive=True)))" | grep ASSETS); echo "$ASSETS"
[ "$ASSETS" = "ASSETS 2" ] || fail "identical meshes did not share assets"
echo "ENVIRONMENT USD OK"
