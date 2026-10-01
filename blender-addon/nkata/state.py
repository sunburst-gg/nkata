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
    last_hashes: dict[str, dict[str, str]] = field(default_factory=dict)
    mirror: dict[str, MirrorView] = field(default_factory=dict)
    error: str = ""
    dirty: bool = False

    def mirror_for(self, part_id: str) -> MirrorView:
        return self.mirror.setdefault(part_id, MirrorView())

    def apply_event(self, event: dict[str, Any]) -> None:
        """mirror.result from SSE updates the part's line."""
        if event.get("kind") != "mirror.result":
            return
        with self.lock:
            view = self.mirror_for(str(event.get("part_id")))
            view.status = str(event.get("status"))
            view.message = str(event.get("message") or "")
            view.mirror_ms = event.get("mirror_ms")
            view.version_id = event.get("version_id")
            view.at = time.time()
            self.dirty = True


STATE = AddonState()
