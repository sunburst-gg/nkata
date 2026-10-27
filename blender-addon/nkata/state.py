"""Add-on state shared by the save hook, the SSE listener, and the panel."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MirrorView:
    status: str = "none"
    message: str = ""
    at: float = 0.0
    mirror_ms: int | None = None
    version_id: str | None = None
    halted: bool = False
    on_save: bool = True
    # What Unreal's validators said about the last preview import (v8 step 22).
    validation: list[dict[str, Any]] = field(default_factory=list)

    def line(self, now: float | None = None) -> str:
        """The one line both panels show. See docs/product.md, Blender panel."""
        now = time.time() if now is None else now
        if self.status == "synced":
            return f"Synced {max(0, int(now - self.at))} s ago"
        if self.status == "syncing":
            return "Syncing"
        if self.status == "pending":
            return self.message or "Waiting"
        if self.status == "failed":
            return f"Failed: {self.message}" if self.message else "Failed"
        if self.status == "skipped":
            return "Saved, nothing changed"
        return "Not mirrored yet"


@dataclass
class AddonState:
    lock: threading.Lock = field(default_factory=threading.Lock)
    part: dict[str, Any] | None = None
    rel_file: str | None = None
    me: dict[str, Any] | None = None
    # UNREAL_ENABLED on the server, from the agent's /me. Off: the panel hides the mirror line.
    unreal: bool = False
    last_hashes: dict[str, dict[str, str]] = field(default_factory=dict)
    mirror: dict[str, MirrorView] = field(default_factory=dict)
    checks: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    # v8 step 17: the last save's export read back (intact.check), or None when it was unread.
    export: dict[str, dict[str, Any] | None] = field(default_factory=dict)
    # The numbers behind the checks, per part: triangles, textures, UV sets, unit scale (checks.summary).
    card: dict[str, dict[str, Any]] = field(default_factory=dict)
    comments: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    online: list[dict[str, Any]] = field(default_factory=list)
    startable: list[dict[str, Any]] = field(default_factory=list)
    publish_line: str = ""
    # The lead's last decision on the open asset, as the panel says it (v8 step 16, item 4).
    decision_line: str = ""
    decision_approved: bool = False
    # v8 (step 12): the project this computer serves, the budgets from the agent, the asset
    # kind per part, the line after Add to project, and which comments the artist has seen.
    project_name: str = ""
    budgets: dict[str, Any] | None = None
    kind: dict[str, str] = field(default_factory=dict)
    added_line: str = ""
    seen_comments: set[str] = field(default_factory=set)
    # The last live check run (monotonic seconds) and whether the scene changed since.
    checks_at: float = 0.0
    scene_dirty: bool = False
    # When the open file was opened, ISO 8601 UTC, for the version's opened_at.
    opened_at: str | None = None
    error: str = ""
    # The server refused to open the part (an approved one): the panel offers no Publish.
    read_only: bool = False
    dirty: bool = False

    def mirror_for(self, part_id: str) -> MirrorView:
        return self.mirror.setdefault(part_id, MirrorView())

    def _first_name(self, user_id: str) -> str:
        """A person's first name from who is online or who wrote a comment here; "The lead" else."""
        people = [e.get("user") or {} for e in self.online]
        for pins in self.comments.values():
            people.extend(c.get("author") or {} for c in pins)
        for p in people:
            if p.get("id") == user_id and p.get("name"):
                return str(p["name"]).split(" ")[0]
        return "The lead"

    def apply_event(self, event: dict[str, Any]) -> None:
        """Events from the agent's SSE stream update what the panel shows."""
        kind = event.get("kind")
        with self.lock:
            if kind == "mirror.result":
                view = self.mirror_for(str(event.get("part_id")))
                view.status = str(event.get("status"))
                view.message = str(event.get("message") or "")
                view.mirror_ms = event.get("mirror_ms")
                view.version_id = event.get("version_id")
                view.at = time.time()
                view.validation = list(event.get("validation") or [])
            elif kind == "presence.changed":
                self.online = list(event.get("online") or [])
            elif kind == "comment.created":
                comment = event.get("comment") or {}
                pins = self.comments.setdefault(str(comment.get("part_id")), [])
                if not any(c.get("id") == comment.get("id") for c in pins):
                    pins.append(comment)
            elif kind == "comment.resolved":
                # Done or reopened in the app: the comment arrives whole, resolved_at tells which.
                comment = event.get("comment") or {}
                pins = self.comments.setdefault(str(comment.get("part_id")), [])
                found = [i for i, c in enumerate(pins) if c.get("id") == comment.get("id")]
                if found:
                    pins[found[0]] = comment
                else:
                    pins.append(comment)
            elif kind == "review.decided" and self.part and event.get("part_id") == self.part["id"]:
                who = self._first_name(str(event.get("actor_id") or ""))
                note = str(event.get("note") or "").strip()
                if event.get("decision") == "approve":
                    self.decision_line = f"{who} approved your last Publish."
                    self.decision_approved = True
                else:
                    self.decision_line = f"{who} sent it back: {note}" if note else f"{who} sent it back. The pins below say where."
                    self.decision_approved = False
            elif kind == "part.state" and self.part and event.get("part_id") == self.part["id"]:
                self.part = {**self.part, "state": event.get("to")}
            elif kind == "lock.granted" and self.part and event.get("part_id") == self.part["id"]:
                self.part = {**self.part, "lock": event.get("lock")}
            elif kind == "lock.released" and self.part and event.get("part_id") == self.part["id"]:
                self.part = {**self.part, "lock": None}
            elif kind == "lock.requested" and self.part and event.get("part_id") == self.part["id"]:
                who = (event.get("requester") or {}).get("name", "Someone")
                self.publish_line = f"{who} asked to open this part. Close the file to hand it over."
            else:
                return
            self.dirty = True


STATE = AddonState()
