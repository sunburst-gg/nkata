#!/usr/bin/env bash
# The model chain, with a real Blender (needs_editor). Blender headless saves a prop into a
# folder the agent serves, against a seeded server. The version must then carry a GLB the app
# can load. Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/model_chain.sh
# Exit 1 when no model lands. First green on 2026-10-13 with Blender 5.2.2 (docs/decisions.md).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/model-chain"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7405
SERVER=http://127.0.0.1:$PORT
rm -rf $E/home $E/proj $E/zip $E/stage; mkdir -p $E/home $E/proj $E/zip $E/stage
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
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
  curl -s "$MODEL_URL" -o $E/model.glb
  echo "model bytes $(stat -c %s $E/model.glb) magic $(head -c 4 $E/model.glb)"
else
  echo "NO MODEL URL"; grep -i "model\|saved\|mirror" $E/agent.log | cut -c1-240 | tail -8; exit 1
fi
echo "---- agent log, model lines"; grep -i "model\|saved\|mirror" $E/agent.log | cut -c1-240 | tail -8
head -c 4 $E/model.glb | grep -q glTF || { echo "the model is not a glTF"; exit 1; }
echo "MODEL CHAIN OK"
