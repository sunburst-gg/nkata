"""HTTP client for the agent local API on localhost:7420. Standard library only, so the
extension ships with no wheels. Types: shared agent.schema.json."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

from . import nkata_shared as shared
from .log import log
from .mapping import agent_url


class AgentError(Exception):
    """The agent answered with an error body, or did not answer."""

    def __init__(self, code: str, message: str, status: int = 0) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.status = status


class AgentClient:
    def __init__(self, token: str, base: str | None = None, timeout: float = 10.0) -> None:
        self.token = token
        self.base = (base or agent_url()).rstrip("/")
        self.timeout = timeout

    def _call(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
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
                err = shared.validate_ErrorBody(json.loads(text))
                raise AgentError(err.error.code, err.error.message, e.code) from e
            except (ValueError, shared.ValidationError):
                raise AgentError("http", f"{e.code}: {text[:200]}", e.code) from e
        except urllib.error.URLError as e:
            raise AgentError("offline", f"agent not reachable at {self.base}: {e.reason}") from e

    def me(self) -> Any:
        return shared.validate_MeResponse(self._call("GET", "/me"))

    def parts(self, rel_file: str) -> list[dict[str, Any]]:
        res = shared.validate_PartsResponse(self._call("GET", "/parts?" + urllib.parse.urlencode({"file": rel_file})))
        return [p.to_dict() for p in res.parts]

    def open_part(self, part_id: str) -> Any:
        return shared.validate_PartOpenResponse(self._call("POST", f"/parts/{part_id}/open"))

    def close_part(self, part_id: str) -> Any:
        return shared.validate_PartCloseResponse(self._call("POST", f"/parts/{part_id}/close"))

    def saved(self, part_id: str, changed: bool, spool_path: str | None, manifest: dict[str, Any] | None, source_file: str) -> Any:
        body = shared.validate_PartSavedRequest({"v": 1, "changed": changed, "spool_path": spool_path, "manifest": manifest, "source_file": source_file}).to_dict()
        return shared.validate_PartSavedResponse(self._call("POST", f"/parts/{part_id}/saved", body))

    def mirror_state(self, part_id: str) -> Any:
        return shared.validate_MirrorStateResponse(self._call("GET", f"/parts/{part_id}/mirror")).mirror

    def retry_mirror(self, part_id: str) -> Any:
        return shared.validate_MirrorRetryResponse(self._call("POST", f"/parts/{part_id}/mirror/retry"))


def parse_sse(stream: Any, on_event: Callable[[dict[str, Any]], None]) -> None:
    """Reads text/event-stream frames from a line iterator and calls on_event with each data JSON."""
    data_lines: list[str] = []
    for raw in stream:
        line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
        line = line.rstrip("\r\n")
        if line == "":
            if data_lines:
                try:
                    on_event(json.loads("\n".join(data_lines)))
                except ValueError as e:
                    log("sse.bad_frame", error=str(e))
                data_lines = []
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())


class EventListener(threading.Thread):
    """Background thread on GET /events. Reconnects every 2 s while the agent is away."""

    def __init__(self, client: AgentClient, on_event: Callable[[dict[str, Any]], None]) -> None:
        super().__init__(name="nkata-events", daemon=True)
        self.client = client
        self.on_event = on_event
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        while not self._stop.is_set():
            req = urllib.request.Request(self.client.base + "/events")
            req.add_header("Authorization", f"Bearer {self.client.token}")
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    parse_sse(res, self.on_event)
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                log("sse.disconnected", error=str(e))
            self._stop.wait(2.0)
