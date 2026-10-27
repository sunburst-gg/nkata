#!/usr/bin/env bash
# v8 step 21, the gate. A real Blender saves a door whose pivot is on its hinge and a barrel whose
# pivot floats, into a project whose lead then sets the prop pivot rule to block. Neither can be
# published; a lead accepts the door with a reason; the door publishes, the reason shows on the
# part (what the app reads) and in the Blender panel on the next save; the barrel is still held.
# No Unreal editor is needed. Blender runs with its own user folder, never the one on this Mac.
# Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/studio_rules.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/studio-rules"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7409
APORT=7429
SERVER=http://127.0.0.1:$PORT
rm -rf "$E" && mkdir -p "$E/home" "$E/proj" "$E/lead" "$E/zip" "$E/stage"
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
trap cleanup EXIT
fail() { echo "FAIL: $*"; exit 1; }

set -a; source ./scripts/testenv.sh up; set +a
export NKATA_DEV=1 PORT PUBLIC_URL=$SERVER LOG_LEVEL=info
pnpm --filter @nkata/server db:reset >/dev/null && pnpm --filter @nkata/server seed >/dev/null
pnpm --filter @nkata/server start > "$E/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do curl -sf $SERVER/health >/dev/null && break; sleep 0.2; done
curl -sf $SERVER/health >/dev/null || { tail -20 "$E/server.log"; fail "server did not start"; }

TOKEN=$(cd "$E/proj" && $BIN login --server $SERVER --email env@sunburst.gg | jq -r .token)
LEAD=$(cd "$E/lead" && $BIN login --server $SERVER --email director@sunburst.gg | jq -r .token)
PROJECT=$(curl -s -H "Authorization: Bearer $TOKEN" $SERVER/projects | jq -r '.projects[0].id')
(cd "$E/proj" && $BIN init --server $SERVER --project "$PROJECT" --token "$TOKEN" >/dev/null)
HOME="$E/home" $BIN --folder "$E/proj" serve --port $APORT > "$E/agent.log" 2>&1 &
AGENT_PID=$!
for _ in $(seq 1 50); do curl -sf -H "Authorization: Bearer $(cat "$E/proj/.nkata-agent/token" 2>/dev/null)" http://127.0.0.1:$APORT/me >/dev/null && break; sleep 0.2; done
ATOKEN=$(cat "$E/proj/.nkata-agent/token")

cp -r blender-addon/. "$E/stage/" && rm -rf "$E/stage/tests" "$E/stage/nkata/nkata_shared" && cp -r shared/py "$E/stage/nkata/nkata_shared"
(cd "$E/stage" && zip -qr "$E/zip/nkata-addon.zip" . -x '*/__pycache__/*' '*.pyc')
HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" "$B" --command extension install-file -r user_default -e "$E/zip/nkata-addon.zip" 2>&1 | tail -1

cat > "$E/save.py" <<'PY'
# NAME is Door or Barrel. A door: 0.9 m wide, 2 m tall, the origin on its hinge side, 1 m up. A
# barrel: its origin 0.4 m above its base. A second save of a file prints the panel's lines.
import bpy, os, sys
from pathlib import Path
E = Path(__file__).resolve().parent
name = os.environ["NAME"]
target = E / "proj" / "Objects" / name / f"{name}.blend"
if not bpy.data.filepath:
    target.parent.mkdir(parents=True, exist_ok=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = f"SM_{name}"
    for v in obj.data.vertices:
        if name == "Door":
            v.co.x, v.co.y, v.co.z = (v.co.x + 1) * 0.45, v.co.y * 0.025, v.co.z
        else:
            v.co.z = v.co.z * 0.5 + 0.1
    obj.location = (-0.45, 0, 1.0) if name == "Door" else (0, 0, 0.4)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    print("SAVE_RESULT", bpy.ops.wm.save_as_mainfile(filepath=str(target)))
else:
    print("SAVE_RESULT", bpy.ops.wm.save_mainfile())
    from importlib import import_module
    panel = import_module(next(m for m in sys.modules if m.endswith("nkata.panel")))
    state = import_module(next(m for m in sys.modules if m.endswith("nkata.state"))).STATE
    for line in panel.check_lines(state.part):
        print("PANEL_LINE", line.key, line.level, line.passed, line.sentence, "|", line.accepted)
PY

api() { curl -s -H "Authorization: Bearer $1" "$SERVER$2"; }
blender() { NAME="$1" HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" NKATA_AGENT_URL=http://127.0.0.1:$APORT "$B" -b ${2:+"$2"} --python "$E/save.py" > "$E/save-$1.log" 2>&1; grep -E "^SAVE_RESULT|Traceback" "$E/save-$1.log" | head -2; }
part_of() { api "$TOKEN" "/parts?project_id=$PROJECT" | jq -r --arg n "$1" '.parts[] | select(.asset_name==$n) | .id'; }
publish() { curl -s -X POST -H "Authorization: Bearer $ATOKEN" -H 'content-type: application/json' "http://127.0.0.1:$APORT/parts/$1/publish" -d "{\"v\":1,\"check_results\":[],\"ready\":false,\"note\":\"$2\"}"; }

blender Door; blender Barrel
DOOR=$(part_of Door); BARREL=$(part_of Barrel)
[ -n "$DOOR" ] && [ -n "$BARREL" ] || fail "the saves made no assets"
pivot() { api "$TOKEN" "/parts/$1/versions" | jq -r '.versions | max_by(.created_at) | .id' | xargs -I{} curl -s -H "Authorization: Bearer $TOKEN" "$SERVER/parts/$1/versions/{}/checks" | jq -c '.results[] | select(.check_id=="pivot_at_base") | {passed, severity}'; }
echo "door pivot as saved: $(pivot "$DOOR"), barrel: $(pivot "$BARREL")"
[ "$(pivot "$DOOR" | jq -r .passed)" = false ] || fail "the door's hinge pivot passed the base rule"

# The lead raises the prop pivot rule to block in the Object template, as Project settings does.
TPL=$(api "$LEAD" "/projects/$PROJECT/templates" | jq '.templates[] | select(.name=="Object")')
NEXT=$(echo "$TPL" | jq '{file_path, schema: (.schema | .parts[0].severity.pivot_at_base = "block")}')
curl -s -X PUT -H "Authorization: Bearer $LEAD" -H 'content-type: application/json' "$SERVER/projects/$PROJECT/templates/Object" -d "$NEXT" | jq -e '.template.schema.parts[0].severity.pivot_at_base == "block"' >/dev/null || fail "the lead could not set the rule"

R=$(publish "$DOOR" "Door hung."); echo "door publish: $(echo "$R" | jq -c '{published, blocked_by: [.blocked_by[].check_id]}')"
[ "$(echo "$R" | jq -r .published)" = false ] || fail "the door reached the game with its pivot off at block level"
R=$(publish "$BARREL" "Barrel."); echo "barrel publish: $(echo "$R" | jq -c '{published}')"
[ "$(echo "$R" | jq -r .published)" = false ] || fail "the barrel reached the game with its pivot off"

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' "$SERVER/parts/$DOOR/exceptions" -d '{"check_id":"pivot_at_base","reason":"x"}' | jq -e '.error.code == "forbidden"' >/dev/null || fail "an artist accepted a check"
curl -s -X POST -H "Authorization: Bearer $LEAD" -H 'content-type: application/json' "$SERVER/parts/$DOOR/exceptions" -d '{"check_id":"pivot_at_base","reason":"Hinge pivot, on purpose."}' >/dev/null
SHOWN=$(api "$TOKEN" "/parts/$DOOR" | jq -c '(.part // .) | .exceptions[0] | {reason, by: .by.name}')
echo "the part says: $SHOWN"
echo "$SHOWN" | grep -q "Hinge pivot, on purpose." || fail "the accept is not on the part"

R=$(publish "$DOOR" "Door hung."); echo "door publish after the accept: $(echo "$R" | jq -c '{published}')"
[ "$(echo "$R" | jq -r .published)" = true ] || fail "the accepted door did not publish"
R=$(publish "$BARREL" "Barrel."); echo "barrel publish after the door's accept: $(echo "$R" | jq -c '{published}')"
[ "$(echo "$R" | jq -r .published)" = false ] || fail "the door's accept let the barrel through"

blender Door "$E/proj/Objects/Door/Door.blend"
LINE=$(grep "^PANEL_LINE pivot" "$E/save-Door.log")
echo "panel: ${LINE#PANEL_LINE }"
echo "$LINE" | grep -q "block False" || fail "the panel does not show the pivot at block"
echo "$LINE" | grep -q "Accepted by Ngozi: Hinge pivot, on purpose." || fail "the panel does not say who accepted it and why"
echo "STUDIO RULES OK"
