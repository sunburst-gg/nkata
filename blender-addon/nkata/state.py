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
    # The numbers behind the checks, per part: triangles, textures, UV sets, unit scale (checks.summary).
    card: dict[str, dict[str, Any]] = field(default_factory=dict)
    comments: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    online: list[dict[str, Any]] = field(default_factory=list)
    startable: list[dict[str, Any]] = field(default_factory=list)
    publish_line: str = ""
    # When the open file was opened, ISO 8601 UTC, for the version's opened_at.
    opened_at: str | None = None
    error: str = ""
    dirty: bool = False

    def mirror_for(self, part_id: str) -> MirrorView:
        return self.mirror.setdefault(part_id, MirrorView())

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
            elif kind == "presence.changed":
                self.online = list(event.get("online") or [])
            elif kind == "comment.created":
                comment = event.get("comment") or {}
                pins = self.comments.setdefault(str(comment.get("part_id")), [])
                if not any(c.get("id") == comment.get("id") for c in pins):
                    pins.append(comment)
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
