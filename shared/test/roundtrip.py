# Python half of the round-trip test. Reads [{"type": Name, "value": any}] on stdin,
# validates each with the generated validate_<Name>, and prints [{"ok": true, "value": to_dict}]
# or [{"ok": false, "error": str}]. Run from shared/ so `py` resolves to shared/py/.
import json
import sys

sys.path.insert(0, ".")
import py  # noqa: E402

out = []
for item in json.load(sys.stdin):
    fn = getattr(py, f"validate_{item['type']}", None)
    if fn is None:
        out.append({"ok": False, "error": f"no validator for {item['type']}"})
        continue
    try:
        typed = fn(item["value"])
        out.append({"ok": True, "value": py.to_dict(typed)})
    except py.ValidationError as e:
        out.append({"ok": False, "error": str(e)})
json.dump(out, sys.stdout)
