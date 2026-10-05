"""The UE5 panel model: the same seven elements as the Blender N-panel, in the same order and the
same words, plus Review and Level areas. docs/product.md, Surfaces, UE5 panel.

The Editor Utility Widget (ue5-plugin/README.md) is a thin view over this module. Every element
is plain data the widget draws, and every button is one function here. Nothing in this file
needs the editor: `unreal` is only imported where an actor or a camera is touched, so the model
runs in plain Python tests against a fake agent.

Agent local API: shared/schemas/agent.schema.json. Token: <project>/.nkata-agent/token.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_AGENT_URL = "http://127.0.0.1:7420"
AGENT_DIR = ".nkata-agent"
STATE_WORDS = {"locked": "Locked", "draft": "Draft", "ready": "Ready", "approved": "Approved"}
CHECK_WORDS = {
    "unit_scale": "Scale", "name_pattern": "Naming", "triangle_budget": "Triangle budget", "uv_set_present": "UV set",
    "texture_size": "Texture size", "rig_bone_names": "Rig names", "rig_bone_count": "Rig bone count",
    "metahuman_dna_present": "MetaHuman data", "lod_count": "LODs", "collision_present": "Collision", "pivot_at_base": "Pivot at base",
}
UE5_CHECKS = ("lod_count", "collision_present", "metahuman_dna_present", "triangle_budget", "name_pattern")


class AgentError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def find_project_root(start: Path) -> Path | None:
    for parent in [start, *start.parents]:
        if (parent / AGENT_DIR).is_dir():
            return parent
    return None


def read_token(root: Path) -> str:
    override = os.environ.get("NKATA_AGENT_TOKEN")
    if override:
        return override
    return (root / AGENT_DIR / "token").read_text(encoding="utf-8").strip()


class Agent:
    """Standard library client for the agent. The same calls the Blender add-on makes."""

    def __init__(self, token: str, base: str | None = None, timeout: float = 10.0) -> None:
        self.token = token
        self.base = (base or os.environ.get("NKATA_AGENT_URL") or DEFAULT_AGENT_URL).rstrip("/")
        self.timeout = timeout

    def call(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(text)
            except ValueError:
                raise AgentError("http", f"{e.code}: {text[:200]}") from e
            if e.code == 409 and isinstance(parsed, dict) and "granted" in parsed:
                return parsed
            err = parsed.get("error") if isinstance(parsed, dict) else None
            raise AgentError(str((err or {}).get("code", "http")), str((err or {}).get("message", text[:200]))) from e
        except urllib.error.URLError as e:
            raise AgentError("offline", f"agent not reachable at {self.base}: {e.reason}") from e

    def me(self) -> dict[str, Any]:
        return self.call("GET", "/me")

    def parts(self, rel_file: str | None = None) -> list[dict[str, Any]]:
        query = "?" + urllib.parse.urlencode({"file": rel_file}) if rel_file else ""
        return list(self.call("GET", "/parts" + query)["parts"])

    def open_part(self, part_id: str) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/open")

    def close_part(self, part_id: str) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/close")

    def mirror(self, part_id: str) -> dict[str, Any]:
        return self.call("GET", f"/parts/{part_id}/mirror")["mirror"]

    def retry_mirror(self, part_id: str) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/mirror/retry")

    def comments(self, part_id: str) -> list[dict[str, Any]]:
        return list(self.call("GET", f"/parts/{part_id}/comments")["comments"])

    def create_comment(self, part_id: str, point: list[float], normal: list[float], body: str) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/comments", {"v": 1, "point": point, "normal": normal, "body": body})["comment"]

    def publish(self, part_id: str, results: list[dict[str, Any]], ready: bool) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/publish", {"v": 1, "check_results": results, "ready": ready})

    def record_checks(self, part_id: str, results: list[dict[str, Any]]) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/checks", {"v": 1, "results": results})

    def review(self, part_id: str, score: int, decision: str, note: str) -> dict[str, Any]:
        return self.call("POST", f"/parts/{part_id}/review", {"v": 1, "score": score, "decision": decision, "note": note})

    def presence(self, part_id: str | None) -> list[dict[str, Any]]:
        return list(self.call("POST", "/presence", {"v": 1, "part_id": part_id})["online"])


@dataclass
class Element:
    """One drawn line in the widget: a text, an icon word, and what pressing it does."""
    text: str
    icon: str = ""
    action: str = ""
    arg: str = ""


@dataclass
class PanelView:
    header: Element
    mirror: Element
    reference: list[Element]
    checks: list[Element]
    comments: list[Element]
    publish: list[Element]
    presence: Element
    review: list[Element] = field(default_factory=list)
    areas: list[Element] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        def rows(items: list[Element]) -> list[dict[str, str]]:
            return [e.__dict__ for e in items]

        return {
            "header": self.header.__dict__, "mirror": self.mirror.__dict__, "reference": rows(self.reference),
            "checks": rows(self.checks), "comments": rows(self.comments), "publish": rows(self.publish),
            "presence": self.presence.__dict__, "review": rows(self.review), "areas": rows(self.areas), "error": self.error,
        }


def header_line(part: dict[str, Any]) -> str:
    owner = (part.get("owner") or {}).get("name") or "No owner"
    state_word = STATE_WORDS.get(str(part.get("state")), str(part.get("state")))
    lock = part.get("lock")
    lock_word = f"Open by {lock['holder']['name']}" if lock else "Not open"
    return f"{part.get('asset_name')} / {part.get('name')} · {state_word} · {owner} · {lock_word}"


def mirror_line(mirror: dict[str, Any]) -> str:
    status = mirror.get("status")
    if status == "synced":
        return f"Synced {mirror.get('at') or ''}".strip()
    if status == "syncing":
        return "Syncing"
    if status == "pending":
        return str(mirror.get("message") or "Waiting")
    if status == "failed":
        return f"Failed: {mirror.get('message')}" if mirror.get("message") else "Failed"
    if status == "skipped":
        return "Saved, nothing changed"
    return "Not mirrored yet"


def build_view(
    part: dict[str, Any],
    mirror: dict[str, Any],
    checks: list[dict[str, Any]] | None,
    comments: list[dict[str, Any]],
    online: list[dict[str, Any]],
    me: dict[str, Any],
    siblings: list[dict[str, Any]] | None = None,
) -> PanelView:
    """The seven elements plus Review (for reviewers) and Level areas (for a level area)."""
    reference = [Element(Path(r).name, "image", "open_reference", r) for r in part.get("reference_files") or []] or [Element("No reference pinned")]
    check_rows: list[Element] = []
    if checks is None:
        check_rows.append(Element("Checks run on Publish"))
    else:
        for r in checks:
            word = CHECK_WORDS.get(r["check_id"], r["check_id"])
            if r["passed"]:
                check_rows.append(Element(f"{word}: pass" + (" (fixed)" if r.get("auto_fixed") else ""), "pass"))
            else:
                check_rows.append(Element(f"{word}: {r['message']}", "block" if r["severity"] == "block" else "warn"))
    comment_rows = [Element(f"{i + 1} {(c.get('author') or {}).get('name', '')}: {c.get('body', '')}", "resolved" if c.get("resolved_at") else "pin", "frame_pin", str(i)) for i, c in enumerate(comments)]
    comment_rows = comment_rows or [Element("No comments yet")]
    comment_rows.append(Element("Reply", "", "reply"))
    publish = [Element("Publish", "", "publish", "false")]
    if part.get("state") == "draft":
        publish.append(Element("Mark Ready", "", "publish", "true"))
    others = [e for e in online if (e.get("user") or {}).get("id") != me.get("id")]
    presence = Element("Only you here") if not others else Element("Here: " + ", ".join(f"{e['user']['name']}{' in this part' if e.get('part_id') == part['id'] else ''}" for e in others))
    waiting = part.get("waiting_on") or []
    header = Element(header_line(part), "lock" if waiting else "")
    view = PanelView(header, Element(mirror_line(mirror), str(mirror.get("status") or "")), reference, check_rows, comment_rows, publish, presence)
    if waiting:
        view.error = f"Waits on {', '.join(waiting)}"
    roles = set(me.get("roles") or [])
    if roles & {"art_director", "producer"} and part.get("state") in ("ready", "approved"):
        view.review = [Element("Approve", "", "review", "approve"), Element("Send back", "", "review", "send_back")]
    if part.get("kind") == "level_area" and siblings is not None:
        for s in siblings:
            lock = s.get("lock")
            owner = (s.get("owner") or {}).get("name") or "No owner"
            view.areas.append(Element(f"{s['name']} · {owner} · {'open by ' + lock['holder']['name'] if lock else 'free'}", "area", "open_area", s["id"]))
    return view


class Panel:
    """What the widget holds: the open part and the loaded elements. One instance per editor."""

    def __init__(self, agent: Agent, me: dict[str, Any]) -> None:
        self.agent = agent
        self.me = me
        self.part: dict[str, Any] | None = None
        self.checks: list[dict[str, Any]] | None = None
        self.comments: list[dict[str, Any]] = []
        self.online: list[dict[str, Any]] = []
        self.siblings: list[dict[str, Any]] = []
        self.error = ""

    @classmethod
    def connect(cls, project_root: Path, base: str | None = None) -> Panel:
        agent = Agent(read_token(project_root), base)
        me = agent.me()
        return cls(agent, {**me["user"], "roles": me.get("roles", [])})

    def open(self, part_id: str) -> dict[str, Any]:
        """Takes the lock, loads comments and presence, remembers the part."""
        parts = {p["id"]: p for p in self.agent.parts()}
        part = parts.get(part_id)
        if part is None:
            raise AgentError("not_found", f"no part {part_id}")
        res = self.agent.open_part(part_id)
        part = {**part, "lock": res.get("lock")}
        self.part = part
        self.error = "" if res.get("granted") else f"{res['lock']['holder']['name']} has this part."
        self.comments = self.agent.comments(part_id)
        self.online = self.agent.presence(part_id)
        self.siblings = [part if p["id"] == part_id else p for p in parts.values() if p["asset_id"] == part["asset_id"]] if part.get("kind") == "level_area" else []
        return part

    def close(self) -> None:
        if self.part is None:
            return
        self.agent.close_part(self.part["id"])
        self.agent.presence(None)
        self.part = None

    def view(self) -> PanelView:
        if self.part is None:
            raise AgentError("no_part", "Open a part first")
        mirror = self.agent.mirror(self.part["id"])
        v = build_view(self.part, mirror, self.checks, self.comments, self.online, self.me, self.siblings)
        if self.error:
            v.error = self.error
        return v

    def run_checks(self, asset: Any) -> list[dict[str, Any]]:
        """The checks UE5 owns, on the imported asset, recorded on the version."""
        from checks import CHECKS  # the sibling script; sys.path holds scripts/ in the editor

        if self.part is None:
            raise AgentError("no_part", "Open a part first")
        results = []
        for spec in self.part.get("checks") or []:
            run = CHECKS.get(spec["id"])
            if run is None:
                continue
            passed, message = run(asset, dict(spec.get("params") or {}))
            results.append({"check_id": spec["id"], "severity": spec["severity"], "passed": passed, "auto_fixed": False, "message": message})
        self.checks = results
        if results:
            self.agent.record_checks(self.part["id"], results)
        return results

    def publish(self, ready: bool) -> dict[str, Any]:
        if self.part is None:
            raise AgentError("no_part", "Open a part first")
        res = self.agent.publish(self.part["id"], self.checks or [], ready)
        if res.get("published"):
            self.part = {**self.part, "state": res["state"]}
        return res

    def reply(self, point: list[float], normal: list[float], body: str) -> dict[str, Any]:
        if self.part is None:
            raise AgentError("no_part", "Open a part first")
        pin = self.agent.create_comment(self.part["id"], point, normal, body)
        self.comments.append(pin)
        return pin

    def review(self, score: int, decision: str, note: str = "") -> dict[str, Any]:
        if self.part is None:
            raise AgentError("no_part", "Open a part first")
        res = self.agent.review(self.part["id"], score, decision, note)
        self.part = {**self.part, "state": res["state"]}
        return res

    def apply_event(self, event: dict[str, Any]) -> None:
        """Events from the agent's SSE stream, delivered by the widget's tick."""
        kind = event.get("kind")
        if self.part is None:
            return
        if kind == "comment.created" and (event.get("comment") or {}).get("part_id") == self.part["id"]:
            if not any(c.get("id") == event["comment"].get("id") for c in self.comments):
                self.comments.append(event["comment"])
        elif kind == "presence.changed":
            self.online = list(event.get("online") or [])
        elif kind == "part.state" and event.get("part_id") == self.part["id"]:
            self.part = {**self.part, "state": event.get("to")}
        elif kind == "lock.released" and event.get("part_id") == self.part["id"]:
            self.part = {**self.part, "lock": None}
        elif kind == "lock.granted" and event.get("part_id") == self.part["id"]:
            self.part = {**self.part, "lock": event.get("lock")}
