#!/usr/bin/env bash
# v8 step 22, the gate (needs_editor). An Unreal editor must be open with Remote Control on port
# 30010. The gate registers a studio validator in it, written in Python as a studio would: a
# static mesh stays under 1,000 vertices. A real Blender saves a crate with a subdivision that
# takes it over: the validator's words reach the version (what the app reads) and the Blender
# panel, and Publish is held; a lead accepts it and it publishes; taken back, the next save is
# held again, until the artist removes the subdivision and saves. The gate in the task file named
# a mesh prefix; Nkata's import names the mesh, not the artist (docs/decisions.md, 2026-10-27).
# Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/unreal_validators.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/unreal-validators"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
RC="${NKATA_UE5_URL:-http://127.0.0.1:30010}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7410
APORT=7430
SERVER=http://127.0.0.1:$PORT
rm -rf "$E" && mkdir -p "$E/home" "$E/proj" "$E/lead" "$E/zip" "$E/stage"
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${WATCH_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }
curl -sf "$RC/remote/info" >/dev/null || fail "no Unreal editor with Remote Control at $RC"

ue_py() {
  local body; body=$(jq -n --arg c "$1" '{objectPath: "/Script/PythonScriptPlugin.Default__PythonScriptLibrary", functionName: "ExecutePythonCommandEx", parameters: {PythonCommand: $c, ExecutionMode: "ExecuteFile"}}')
  curl -s -X PUT "$RC/remote/object/call" -H 'content-type: application/json' -d "$body" | jq -r '[.LogOutput[]?.Output] | join("\n")'
}

# The studio's validator, registered once per editor session; an earlier gate's is taken out.
ue_py 'import builtins, unreal
subsystem = unreal.get_editor_subsystem(unreal.EditorValidatorSubsystem)
old = getattr(builtins, "nkata_gate_validator", None)
if old is not None and type(old).__name__ != "StudioVertexLimitValidator":
    subsystem.remove_validator(old)
    builtins.nkata_gate_validator = None
if not getattr(builtins, "nkata_gate_validator", None):
    @unreal.uclass()
    class StudioVertexLimitValidator(unreal.EditorValidatorBase):
        @unreal.ufunction(override=True)
        def k2_can_validate_asset(self, asset):
            return isinstance(asset, unreal.StaticMesh)

        @unreal.ufunction(override=True)
        def k2_validate_loaded_asset(self, asset):
            verts = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem).get_number_verts(asset, 0)
            if verts < 1000:
                self.asset_passes(asset)
                return unreal.DataValidationResult.VALID
            self.asset_fails(asset, unreal.Text(f"{verts:,} vertices. Crates stay under 1,000"))
            return unreal.DataValidationResult.INVALID

    builtins.nkata_gate_validator = StudioVertexLimitValidator()
    subsystem.add_validator(builtins.nkata_gate_validator)
print("VALIDATOR", type(builtins.nkata_gate_validator).__name__)' | grep -q "VALIDATOR StudioVertexLimitValidator" || fail "the studio validator did not register"

set -a; source ./scripts/testenv.sh up; set +a
export NKATA_DEV=1 UNREAL_ENABLED=1 PORT PUBLIC_URL=$SERVER LOG_LEVEL=info
pnpm --filter @nkata/server db:reset >/dev/null && pnpm --filter @nkata/server seed >/dev/null
pnpm --filter @nkata/server start > "$E/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do curl -sf $SERVER/health >/dev/null && break; sleep 0.2; done
curl -sf $SERVER/health >/dev/null || { tail -20 "$E/server.log"; fail "server did not start"; }

TOKEN=$(cd "$E/proj" && $BIN login --server $SERVER --email env@sunburst.gg | jq -r .token)
LEAD=$(cd "$E/lead" && $BIN login --server $SERVER --email director@sunburst.gg | jq -r .token)
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
# A crate in Objects/. DENSE=1: a level 4 subdivision, over the studio's vertex limit once the
# export applies it; DENSE=0: none. Each save waits for the preview's validators to answer
# through the agent, then prints the panel's lines.
import bpy, os, sys, time
from importlib import import_module
from pathlib import Path
E = Path(__file__).resolve().parent
dense = os.environ["DENSE"] == "1"
target = E / "proj" / "Objects" / "Crate" / "Crate.blend"
if not bpy.data.filepath:
    target.parent.mkdir(parents=True, exist_ok=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
    obj = bpy.context.active_object
    for v in obj.data.vertices:
        v.co.z += 1.0
    obj.name = "SM_Crate"
obj = next(o for o in bpy.data.objects if o.type == "MESH")
for m in [m for m in obj.modifiers if m.type == "SUBSURF"]:
    obj.modifiers.remove(m)
if dense:
    obj.modifiers.new("Subdivision", "SUBSURF").levels = 4
for v in obj.data.vertices:
    v.co.x *= 1.01
print("SAVE_RESULT", bpy.ops.wm.save_as_mainfile(filepath=str(target)) if not bpy.data.filepath else bpy.ops.wm.save_mainfile())
state = import_module(next(m for m in sys.modules if m.endswith("nkata.state"))).STATE
panel = import_module(next(m for m in sys.modules if m.endswith("nkata.panel")))
view = state.mirror_for(state.part["id"])
for _ in range(240):
    if view.status in ("synced", "failed"):
        break
    time.sleep(0.25)
print("MIRROR", view.status, view.message)
for line in panel.check_lines(state.part):
    print("PANEL_LINE", line.key, line.level, line.passed, line.sentence.replace("\n", " / "), "|", line.accepted)
print("PUBLISH_LABEL", panel.live.publish_label(panel.check_lines(state.part), "Crate."))
PY

api() { curl -s -H "Authorization: Bearer $1" "$SERVER$2"; }
blender() { DENSE="$1" HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" NKATA_AGENT_URL=http://127.0.0.1:$APORT "$B" -b ${2:+"$2"} --python "$E/save.py" > "$E/save.log" 2>&1; grep -E "^SAVE_RESULT|^MIRROR|^PANEL_LINE unreal|^PUBLISH_LABEL|Traceback" "$E/save.log"; }
newest() { api "$TOKEN" "/parts/$PART/versions" | jq -r '.versions | max_by(.created_at) | .id'; }
# What the app reads: the newest save's checks from the server, validators only.
validators() { api "$TOKEN" "/parts/$PART/versions/$(newest)/checks" | jq -c '.results[] | select(.check_id=="unreal_validators") | {passed, severity, message}'; }
publish() { curl -s -X POST -H "Authorization: Bearer $ATOKEN" -H 'content-type: application/json' "http://127.0.0.1:$APORT/parts/$PART/publish" -d '{"v":1,"check_results":[],"ready":false,"note":"Crate."}' | jq -c '{published, blocked_by: [.blocked_by[]?.check_id]}'; }

OUT=$(blender 1); echo "$OUT"
PART=$(api "$TOKEN" "/parts?project_id=$PROJECT" | jq -r '.parts[] | select(.asset_name=="Crate") | .id')
[ -n "$PART" ] || { tail -20 "$E/save.log"; fail "the save made no asset"; }
echo "$OUT" | grep -q "^MIRROR synced" || { grep -i mirror "$E/agent.log" | tail -3 | cut -c1-300; fail "the save did not reach the preview"; }
echo "$OUT" | grep -q "^PANEL_LINE unreal block False Unreal: .* vertices. Crates stay under 1,000" || fail "the panel does not show the validator's words"
for _ in $(seq 1 20); do [ -n "$(validators)" ] && break; sleep 0.25; done
echo "the app reads: $(validators)"
validators | grep -q '"passed":false,"severity":"block","message":".* vertices. Crates stay under 1,000' || fail "the version does not carry the validator's words"
R=$(publish); echo "publish: $R"
echo "$R" | grep -q '"published":false,"blocked_by":\["unreal_validators"\]' || fail "the validator's error did not hold Publish"

curl -s -X POST -H "Authorization: Bearer $LEAD" -H 'content-type: application/json' "$SERVER/parts/$PART/exceptions" -d '{"check_id":"unreal_validators","reason":"Hero crate, signed off at this density."}' >/dev/null
R=$(publish); echo "publish after the lead accepts: $R"
echo "$R" | grep -q '"published":true' || fail "the accepted finding still held Publish"
curl -s -X DELETE -H "Authorization: Bearer $LEAD" "$SERVER/parts/$PART/exceptions/unreal_validators" >/dev/null

OUT=$(blender 1 "$E/proj/Objects/Crate/Crate.blend"); echo "$OUT"
R=$(publish); echo "publish of the next save, the accept taken back: $R"
echo "$R" | grep -q '"published":false' || fail "the taken back accept still let it through"

OUT=$(blender 0 "$E/proj/Objects/Crate/Crate.blend"); echo "$OUT"
echo "$OUT" | grep -q "^MIRROR synced" || fail "the save without the subdivision did not reach the preview"
echo "$OUT" | grep -q "^PANEL_LINE unreal" && fail "the panel still shows a finding after the fix"
for _ in $(seq 1 20); do validators | grep -q '"passed":true' && break; sleep 0.25; done
echo "the app reads: $(validators)"
R=$(publish); echo "publish after the fix: $R"
echo "$R" | grep -q '"published":true' || fail "the fixed crate did not publish"
echo "UNREAL VALIDATORS OK"
