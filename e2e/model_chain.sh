#!/usr/bin/env bash
# The model chain and the measured day, with a real Blender (needs_editor). Blender headless
# saves a prop into a folder the agent serves, against a seeded server. The version must then
# carry a GLB the app can load. Then the day from the brief: a second folder with its own token
# pulls the file, the reviewer sends it back with a pin, the artist saves and publishes again,
# the reviewer approves. The round trip is timed and must come in under sixty seconds.
# Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/model_chain.sh
# Exit 1 when no model lands or the day runs long. First green on 2026-10-13 with Blender 5.2.2.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/model-chain"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7405
SERVER=http://127.0.0.1:$PORT
rm -rf $E/home $E/home2 $E/proj $E/proj2 $E/zip $E/stage; mkdir -p $E/home $E/home2 $E/proj $E/proj2 $E/zip $E/stage
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${WATCH_PID:-0} ${AGENT2_PID:-0} ${WATCH2_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
trap cleanup EXIT

set -a; source ./scripts/testenv.sh up; set +a
export NKATA_DEV=1 PORT PUBLIC_URL=$SERVER LOG_LEVEL=info
pnpm --filter @nkata/server db:reset >/dev/null && pnpm --filter @nkata/server seed >/dev/null
pnpm --filter @nkata/server start > $E/server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do curl -sf $SERVER/health >/dev/null && break; sleep 0.2; done
curl -sf $SERVER/health >/dev/null || { echo "server did not start"; tail -20 $E/server.log; exit 1; }
echo "server up"

TOKEN=$(cd $E/proj && $BIN login --server $SERVER --email env@sunburst.gg | jq -r .token)
PROJECT=$(curl -s -H "Authorization: Bearer $TOKEN" $SERVER/projects | jq -r '.projects[0].id')
echo "token ok, project $PROJECT"
(cd $E/proj && $BIN init --server $SERVER --project $PROJECT --token $TOKEN >/dev/null)
HOME=$E/home $BIN --folder $E/proj serve --port 7420 --ue5-scripts $ROOT/ue5-plugin/scripts > $E/agent.log 2>&1 &
AGENT_PID=$!
# The app runs the watcher next to the local API: push on change, pull every few seconds.
$BIN --folder $E/proj watch --pull-every-secs 2 > $E/watch.log 2>&1 &
WATCH_PID=$!
for _ in $(seq 1 50); do curl -sf -H "Authorization: Bearer $(cat $E/proj/.nkata-agent/token 2>/dev/null)" http://127.0.0.1:7420/me >/dev/null && break; sleep 0.2; done
echo "agent up: $(curl -s -H "Authorization: Bearer $(cat $E/proj/.nkata-agent/token)" http://127.0.0.1:7420/me | jq -c '{mode, spool_dir}')"
echo "pointer: $(cat $E/home/.nkata/agent.json)"

# The add-on zip exactly as the app builds it: the add-on plus shared/py as nkata/nkata_shared.
cp -r blender-addon/. $E/stage/ && rm -rf $E/stage/tests $E/stage/nkata/nkata_shared && cp -r shared/py $E/stage/nkata/nkata_shared
(cd $E/stage && zip -qr $E/zip/nkata-addon.zip . -x '*/__pycache__/*' '*.pyc')
HOME=$E/home $B --command extension install-file -r user_default -e $E/zip/nkata-addon.zip 2>&1 | tail -1

cat > $E/save.py <<'PY'
import bpy
from pathlib import Path
E = Path(__file__).resolve().parent
col = bpy.data.collections["Collection"]
col.name = "model"
cube = bpy.data.objects["Cube"]
cube.name = "SM_Cube"
# Origin at the base: the mesh sits on z 0 with the origin there.
for v in cube.data.vertices:
    v.co.z += 1.0
cube.location = (0.0, 0.0, 0.0)
target = E / "proj" / "Kettle" / "model.blend"
target.parent.mkdir(parents=True, exist_ok=True)
print("SAVE_AS", target)
print("SAVE_RESULT", bpy.ops.wm.save_as_mainfile(filepath=str(target)))
PY
HOME=$E/home NKATA_AGENT_URL=http://127.0.0.1:7420 $B -b --python $E/save.py > $E/blender.log 2>&1
grep -E "^SAVE_|export\.|save\.posted|Traceback|Error" $E/blender.log | cut -c1-300

PART=$(curl -s -H "Authorization: Bearer $TOKEN" "$SERVER/parts?project_id=$PROJECT" | jq -r '.parts[] | select(.asset_name=="Kettle" and .name=="model") | .id')
echo "part $PART"
MODEL_URL=""
for _ in $(seq 1 60); do
  MODEL_URL=$(curl -s -H "Authorization: Bearer $TOKEN" "$SERVER/parts/$PART/versions" | jq -r '.versions[0].model_url // empty')
  [ -n "$MODEL_URL" ] && break
  sleep 0.5
done
echo "versions: $(curl -s -H "Authorization: Bearer $TOKEN" "$SERVER/parts/$PART/versions" | jq -c '.versions[0] | {id, published, mirror_status, has_model: (.model_url != null), has_render: (.render_url != null), objects: (.manifest.objects | length)}')"
if [ -n "$MODEL_URL" ]; then
  # The app fetches this cross-origin, so the answer must carry CORS for the app's origin.
  curl -s -D $E/model.headers -H "Origin: http://localhost:1420" "$MODEL_URL" -o $E/model.glb
  echo "model bytes $(stat -c %s $E/model.glb) magic $(head -c 4 $E/model.glb) cors $(grep -i '^access-control-allow-origin' $E/model.headers | tr -d '\r' | cut -d' ' -f2)"
  grep -qi '^access-control-allow-origin: http://localhost:1420' $E/model.headers || { echo "the model link answers no CORS for the app"; exit 1; }
else
  echo "NO MODEL URL"; grep -i "model\|saved\|mirror" $E/agent.log | cut -c1-240 | tail -8; exit 1
fi
echo "---- agent log, model lines"; grep -i "model\|saved\|mirror" $E/agent.log | cut -c1-240 | tail -8
head -c 4 $E/model.glb | grep -q glTF || { echo "the model is not a glTF"; exit 1; }
echo "MODEL CHAIN OK"

# ---- The measured day. Two folders, two people, one asset. The clock starts at the artist's
# Publish and stops when the reviewer's Approve lands, with a pull, a send back with a pin, a
# second save, and a second Publish in between (docs/tasks/07-blender-first.md, slice 10).
AGENT=http://127.0.0.1:7420
ATOKEN=$(cat $E/proj/.nkata-agent/token)
api() { curl -s -H "Authorization: Bearer $1" -H 'content-type: application/json' "${@:2}"; }
T0=$(date +%s.%N)
echo "publish 1: $(api $ATOKEN -X POST $AGENT/parts/$PART/publish -d '{"v":1,"check_results":[],"ready":true,"note":"First kettle, base at the origin"}' | jq -c '{published, blocked_by}')"
V1=$(api $TOKEN $SERVER/parts/$PART/versions | jq -r '.versions[0].id')

# The reviewer's folder: its own token, its own agent. The sync pulls what the artist pushed.
DTOKEN=$(cd $E/proj2 && $BIN login --server $SERVER --email director@sunburst.gg | jq -r .token)
(cd $E/proj2 && $BIN init --server $SERVER --project $PROJECT --token $DTOKEN >/dev/null)
HOME=$E/home2 $BIN --folder $E/proj2 serve --port 7421 --ue5-scripts $ROOT/ue5-plugin/scripts > $E/agent2.log 2>&1 &
AGENT2_PID=$!
$BIN --folder $E/proj2 watch --pull-every-secs 2 > $E/watch2.log 2>&1 &
WATCH2_PID=$!
for _ in $(seq 1 120); do [ -s $E/proj2/Kettle/model.blend ] && break; sleep 0.5; done
[ -s $E/proj2/Kettle/model.blend ] || { echo "the file did not reach the reviewer's folder"; tail -5 $E/watch.log $E/watch2.log | cut -c1-200; exit 1; }
echo "pulled: $(stat -c %s $E/proj2/Kettle/model.blend) bytes in the second folder"

# Send back, with the note pinned on the mesh.
echo "pin: $(api $DTOKEN -X POST $SERVER/comments -d "{\"part_id\":\"$PART\",\"version_id\":\"$V1\",\"point\":[0,0,1],\"normal\":[0,0,1],\"body\":\"Spout reads thin. Thicken it.\"}" | jq -c '{id: .comment.id, point: .comment.point}')"
echo "send back: $(api $DTOKEN -X POST $SERVER/reviews -d "{\"part_id\":\"$PART\",\"version_id\":\"$V1\",\"score\":2,\"decision\":\"send_back\",\"note\":\"Spout reads thin.\"}" | jq -c '{decision: .review.decision}')"
echo "state after send back: $(api $TOKEN $SERVER/parts/$PART | jq -r '.part.state')"

# The artist thickens the spout, saves, and publishes again.
cat > $E/save2.py <<'PY'
import bpy
cube = bpy.data.objects["SM_Cube"]
cube.scale.x = 1.1
print("SAVE_RESULT", bpy.ops.wm.save_mainfile())
PY
HOME=$E/home NKATA_AGENT_URL=$AGENT $B -b $E/proj/Kettle/model.blend --python $E/save2.py > $E/blender2.log 2>&1
grep -E "^SAVE_|Traceback|Error" $E/blender2.log | cut -c1-200
V2=$V1
for _ in $(seq 1 60); do V2=$(api $TOKEN $SERVER/parts/$PART/versions | jq -r '.versions[0].id'); [ "$V2" != "$V1" ] && break; sleep 0.5; done
[ "$V2" != "$V1" ] || { echo "the second save made no version"; exit 1; }
echo "publish 2: $(api $ATOKEN -X POST $AGENT/parts/$PART/publish -d '{"v":1,"check_results":[],"ready":true,"note":"Thicker spout"}' | jq -c '{published, blocked_by}')"
echo "approve: $(api $DTOKEN -X POST $SERVER/reviews -d "{\"part_id\":\"$PART\",\"version_id\":\"$V2\",\"score\":5,\"decision\":\"approve\",\"note\":\"\"}" | jq -c '{decision: .review.decision}')"
T1=$(date +%s.%N)
STATE=$(api $TOKEN $SERVER/parts/$PART | jq -r '.part.state')
SECS=$(python3 -c "print(round($T1 - $T0, 1))")
echo "round trip ${SECS}s, state $STATE, notes: $(api $TOKEN $SERVER/parts/$PART/versions | jq -c '[.versions[] | select(.published) | .note]')"
[ "$STATE" = "approved" ] || { echo "the part is not Approved"; exit 1; }
python3 -c "import sys; sys.exit(0 if $SECS < 60 else 1)" || { echo "the round trip ran over sixty seconds"; exit 1; }
echo "MEASURED DAY OK"
