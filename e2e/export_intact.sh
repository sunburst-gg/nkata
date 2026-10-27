#!/usr/bin/env bash
# v8 step 17, the Blender half of the gate (needs_editor). A real Blender builds a rigged,
# animated, textured character and saves it into a project the agent serves. The save must
# reach the server with the rig, the animation, and the export read back: first with one texture
# file missing and one texture wired to nothing, both named; then fixed and intact; then with a
# bone renamed, which names the bone that is gone.
# Run: NKATA_BLENDER=/Applications/Blender.app/Contents/MacOS/Blender e2e/export_intact.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E="$ROOT/.testenv/export-intact"
B="${NKATA_BLENDER:?set NKATA_BLENDER to the Blender executable}"
cargo build -q --bin nkata-agent && BIN="$ROOT/target/debug/nkata-agent"
PORT=7406
APORT=7426
SERVER=http://127.0.0.1:$PORT
rm -rf "$E" && mkdir -p "$E/home" "$E/proj" "$E/zip" "$E/stage"
cd "$ROOT"
cleanup() { kill ${AGENT_PID:-0} ${WATCH_PID:-0} ${SERVER_PID:-0} 2>/dev/null; ./scripts/testenv.sh down >/dev/null 2>&1; }
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
PROJECT=$(curl -s -H "Authorization: Bearer $TOKEN" $SERVER/projects | jq -r '.projects[0].id')
(cd "$E/proj" && $BIN init --server $SERVER --project "$PROJECT" --token "$TOKEN" >/dev/null)
HOME="$E/home" $BIN --folder "$E/proj" serve --port $APORT --ue5-scripts "$ROOT/ue5-plugin/scripts" > "$E/agent.log" 2>&1 &
AGENT_PID=$!
$BIN --folder "$E/proj" watch --pull-every-secs 2 > "$E/watch.log" 2>&1 &
WATCH_PID=$!
for _ in $(seq 1 50); do curl -sf -H "Authorization: Bearer $(cat "$E/proj/.nkata-agent/token" 2>/dev/null)" http://127.0.0.1:$APORT/me >/dev/null && break; sleep 0.2; done

# The add-on exactly as the app installs it.
cp -r blender-addon/. "$E/stage/" && rm -rf "$E/stage/tests" "$E/stage/nkata/nkata_shared" && cp -r shared/py "$E/stage/nkata/nkata_shared"
(cd "$E/stage" && zip -qr "$E/zip/nkata-addon.zip" . -x '*/__pycache__/*' '*.pyc')
HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" "$B" --command extension install-file -r user_default -e "$E/zip/nkata-addon.zip" 2>&1 | tail -1

cat > "$E/save1.py" <<'PY'
# A two bone rig skinning a cube, a 30 frame Walk, a material with three image textures: one
# wired into the Principled BSDF, one wired to nothing, one whose file is gone.
import bpy
from pathlib import Path
E = Path(__file__).resolve().parent
target = E / "proj" / "Objects" / "Hero" / "Hero.blend"
target.parent.mkdir(parents=True, exist_ok=True)
tex = target.parent / "textures"
tex.mkdir(exist_ok=True)
for name in ("T_Hero_D", "T_Hero_Unused", "T_Hero_R"):
    img = bpy.data.images.new(name + "_px", 16, 16)
    img.filepath_raw = str(tex / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)
col = bpy.data.collections["Collection"]
arm_data = bpy.data.armatures.new("Rig")
rig = bpy.data.objects.new("Rig", arm_data)
col.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
root = arm_data.edit_bones.new("root"); root.head = (0, 0, 0); root.tail = (0, 0, 1)
spine = arm_data.edit_bones.new("spine"); spine.head = (0, 0, 1); spine.tail = (0, 0, 2); spine.parent = root
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 1))
body = bpy.context.active_object
body.name = "SK_Hero"
for c in list(body.users_collection):
    c.objects.unlink(body)
col.objects.link(body)
body.parent = rig
mod = body.modifiers.new("Armature", "ARMATURE"); mod.object = rig
for bone in ("root", "spine"):
    body.vertex_groups.new(name=bone).add(list(range(len(body.data.vertices))), 0.5, "REPLACE")
mat = bpy.data.materials.new("M_Hero")
mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
for name in ("T_Hero_D", "T_Hero_Unused", "T_Hero_R"):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(tex / f"{name}.png"))
    if name == "T_Hero_D":
        links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
body.data.materials.append(mat)
(tex / "T_Hero_R.png").unlink()
bpy.data.images["T_Hero_R.png"].filepath = str(tex / "T_Hero_R.png")
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
pb = rig.pose.bones["spine"]
pb.rotation_mode = "XYZ"
pb.rotation_euler = (0, 0, 0); pb.keyframe_insert("rotation_euler", frame=1)
pb.rotation_euler = (0.5, 0, 0); pb.keyframe_insert("rotation_euler", frame=31)
bpy.ops.object.mode_set(mode="OBJECT")
rig.animation_data.action.name = "Walk"
print("SAVE_RESULT", bpy.ops.wm.save_as_mainfile(filepath=str(target)))
PY
cat > "$E/save2.py" <<'PY'
# The fix: the texture wired to nothing and the one whose file is gone leave the material.
import bpy
mat = bpy.data.materials["M_Hero"]
for node in list(mat.node_tree.nodes):
    if node.type == "TEX_IMAGE" and node.image and node.image.name in ("T_Hero_Unused.png", "T_Hero_R.png"):
        mat.node_tree.nodes.remove(node)
print("SAVE_RESULT", bpy.ops.wm.save_mainfile())
PY
cat > "$E/save3.py" <<'PY'
# A bone renamed: the engine's skeleton is built from the names.
import bpy
bpy.data.objects["Rig"].data.bones["spine"].name = "chest"
print("SAVE_RESULT", bpy.ops.wm.save_mainfile())
PY

api() { curl -s -H "Authorization: Bearer $TOKEN" "$SERVER$1"; }
latest() { api "/parts/$PART/versions" | jq -c '.versions | max_by(.created_at) | .manifest'; }
wait_new() {  # waits for a version newer than $1, prints its manifest
  for _ in $(seq 1 60); do
    local m; m=$(api "/parts/$PART/versions" | jq -c --arg n "$1" '[.versions[] | select(.created_at > $n)] | max_by(.created_at) | .manifest // empty')
    [ -n "$m" ] && [ "$m" != "null" ] && { echo "$m"; return; }
    sleep 0.5
  done
}
run() { HOME="$E/home" BLENDER_USER_RESOURCES="$E/blender" NKATA_AGENT_URL=http://127.0.0.1:$APORT "$B" -b ${2:+"$2"} --python "$E/$1" > "$E/$1.log" 2>&1; grep -E "^SAVE_RESULT|Traceback|Error" "$E/$1.log" | head -5; }

run save1.py
PART=$(api "/parts?project_id=$PROJECT" | jq -r '.parts[] | select(.asset_name=="Hero") | .id')
[ -n "$PART" ] || { tail -20 "$E/save1.py.log"; fail "the save made no asset"; }
M1=$(wait_new "")
[ -n "$M1" ] || fail "the first save reached no version"
echo "save 1: $(echo "$M1" | jq -c '{bones, animations, export}')"
echo "$M1" | jq -e '.bones == ["root","spine"]' >/dev/null || fail "the rig did not reach the server"
echo "$M1" | jq -e '[.animations[].name] == ["Walk"] and (.animations[0].seconds > 1.2)' >/dev/null || fail "the animation did not reach the export"
echo "$M1" | jq -e '.export.intact == false' >/dev/null || fail "a lost texture read as intact"
echo "$M1" | jq -e '[.export.losses[].kind] | sort == ["texture","texture_file"]' >/dev/null || fail "the losses are not the two textures"
echo "$M1" | jq -e '.export.losses[] | select(.kind=="texture_file") | .names == ["T_Hero_R.png"]' >/dev/null || fail "the missing file is not named"
echo "$M1" | jq -e '.export.losses[] | select(.kind=="texture") | .names == ["T_Hero_Unused.png"]' >/dev/null || fail "the unwired texture is not named"
T1=$(api "/parts/$PART/versions" | jq -r '.versions | max_by(.created_at) | .created_at')

run save2.py "$E/proj/Objects/Hero/Hero.blend"
M2=$(wait_new "$T1")
echo "save 2: $(echo "$M2" | jq -c '.export')"
echo "$M2" | jq -e '.export == {"intact": true, "losses": []}' >/dev/null || fail "the fixed save is not intact"
T2=$(api "/parts/$PART/versions" | jq -r '.versions | max_by(.created_at) | .created_at')

run save3.py "$E/proj/Objects/Hero/Hero.blend"
M3=$(wait_new "$T2")
echo "save 3: $(echo "$M3" | jq -c '{bones, export}')"
echo "$M3" | jq -e '.export.bones_changed == ["spine"]' >/dev/null || fail "the renamed bone is not named"
echo "EXPORT INTACT OK"
